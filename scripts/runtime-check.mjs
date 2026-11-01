import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const origin='http://127.0.0.1:8799';
const mf=new Miniflare(convertV4MiniflareOptions({
  modules:true,scriptPath:'artifacts/worker/index.js',compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],
  host:'127.0.0.1',port:8799,
  d1Databases:['DB'],r2Buckets:['FILES','BACKUPS'],
  assets:{directory:'dist',binding:'ASSETS',run_worker_first:true,routerConfig:{has_user_worker:true}},
  bindings:{ENVIRONMENT:'development',APP_ORIGIN:origin,PUBLIC_SIGNUP_ENABLED:'true',LAUNCH_APPROVED:'false',ENABLE_STAGING_ISSUE:'true',TERMS_VERSION:'test-only-terms',PRIVACY_VERSION:'test-only-privacy',RELEASE_ID:'runtime-test',STRIPE_MODE:'test',DELIVERY_ENCRYPTION_KEY:'ab'.repeat(32)}
}));
const hash=s=>createHash('sha256').update(s).digest('hex');
const fixture={id:'runtime-owner',email:'owner@example.test',token:'12'.repeat(32)},other={id:'runtime-other',email:'other@example.test',token:'34'.repeat(32)};
let browser,page,stage='initialisation';const errors=[],consoleMessages=[];
try{
 await mkdir('artifacts/browser',{recursive:true});
 await mf.ready;const db=await mf.getD1Database('DB');
 for(const name of (await readdir('migrations')).filter(n=>n.endsWith('.sql')).sort()){
  let pending='';for(const line of (await readFile('migrations/'+name,'utf8')).split('\n')){
   if(/^\s*--/.test(line))continue;pending+=line+'\n';
   if(/;\s*$/.test(line)&&(!/^\s*CREATE TRIGGER/i.test(pending)||/END;\s*$/.test(line))){await db.prepare(pending).run();pending='';}
  }if(pending.trim())throw new Error('Incomplete migration '+name);
 }
 const now=Math.floor(Date.now()/1000);
 for(const u of [fixture,other])await db.batch([
  db.prepare('INSERT INTO users(id,email,created_at) VALUES(?,?,?)').bind(u.id,u.email,now),
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').bind(hash(u.token),u.id,now+3600,now)
 ]);
 async function call(route,{method='GET',body,ws,user=fixture,headers={}}={}){
  const h={Origin:origin,Cookie:'pr_session='+user.token,...headers};if(ws)h['X-Workspace-Id']=ws;
  if(body!==undefined)h['Content-Type']='application/json';
  const r=await mf.dispatchFetch(origin+route,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let data;try{data=JSON.parse(text);}catch{}
  return {status:r.status,data,text,headers:r.headers};
 }
 stage='runtime API contracts';
 const me=await call('/api/me');assert.equal(me.status,200,me.text);
 const wsResult=await call('/api/workspaces',{method:'POST',body:{name:'Runtime Test Agency',accepted:true,termsVersion:'test-only-terms',privacyVersion:'test-only-privacy'}});assert.equal(wsResult.status,201,wsResult.text);const ws=wsResult.data.id;
 const property=await call('/api/properties',{method:'POST',ws,body:{address:'100 Runtime Test Road, Perth WA'}});assert.equal(property.status,201,property.text);
 const p=property.data.id;
 const created=await call(`/api/properties/${p}/reports`,{method:'POST',ws,body:{reportType:'Custom'}});assert.equal(created.status,201,created.text);let report=created.data;
 report.details.formName='Runtime inspection';report.areas=[{id:'runtime-area',name:'Site',items:[{id:'runtime-item',name:'Gate',agentComments:'Inspected. No visible damage.'}]}];
 const saved=await call(`/api/reports/${report.id}`,{method:'PUT',ws,body:{report,expectedRevision:report.revision}});assert.equal(saved.status,200,saved.text);report=saved.data;
 assert.equal((await call(`/api/reports/${report.id}`,{ws,user:other})).status,404);
 assert.equal((await call(`/api/reports/${report.id}`,{method:'PUT',ws,body:{report,expectedRevision:1}})).status,409);
 const preview=await call(`/api/reports/${report.id}/preview`,{ws});assert.equal(preview.status,200,preview.text.slice(0,300));assert.ok(preview.text.startsWith('%PDF-'));
 console.log('PASS: Workers runtime, actual D1 migrations/CAS/tenant isolation and trusted PDF rendering.');
 if(process.env.BROWSER_TEST!=='0'){
  const {chromium,expect}=await import('@playwright/test');
  const executablePath=process.env.CHROMIUM_PATH;
  browser=await chromium.launch({...(executablePath?{executablePath}:{}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  await context.addCookies([{name:'pr_session',value:fixture.token,url:origin,httpOnly:true,sameSite:'Lax'}]);
  page=await context.newPage();page.setDefaultTimeout(20000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>consoleMessages.push(m.type()+': '+m.text()));
  page.on('dialog',dialog=>dialog.accept());
  stage='open visual editor';await page.goto(`${origin}/editor.html?workspace=${ws}&report=${report.id}`);
  await expect(page.getByRole('status')).toContainText('Report loaded.');
  await page.screenshot({path:'artifacts/browser/editor-desktop.png',fullPage:true});
  assert.equal(errors.length,0,errors.join('\n'));
  stage='enable encrypted field mode';
  await page.getByRole('button',{name:'Enable offline field mode',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Encrypted offline field mode enabled for this session.');
  await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  stage='offline reload';await context.setOffline(true);await page.reload();
  // Status also includes the Offline / Unsaved edits indicators: do not exact-match its whole text.
  await expect(page.getByRole('status')).toContainText('A locally saved draft has been restored. Sync before finalising.');
  stage='offline editing and local persistence';
  const offlineComment='Updated in offline browser acceptance; persisted after reconnect.';
  await page.locator('textarea').first().fill(offlineComment);
  await page.getByRole('button',{name:'Save / Sync',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Encrypted draft saved on this device. Not yet in the cloud.');
  await page.reload();await expect(page.locator('textarea').first()).toHaveValue(offlineComment);
  stage='reconnect and server persistence';
  await context.setOffline(false);await page.getByRole('button',{name:'Save / Sync',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('All changes saved to this workspace.');
  const synced=await call(`/api/reports/${report.id}`,{ws});assert.equal(synced.status,200,synced.text);
  assert.equal(synced.data.areas[0].items[0].agentComments,offlineComment);
  assert.equal(errors.length,0,errors.join('\n'));
  stage='mobile layout';await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/browser/editor-mobile.png',fullPage:true});
  console.log('PASS: Chromium visual editor, encrypted offline edit/reload and verified server synchronisation.');
  await context.close();page=null;
 }
 await writeFile('artifacts/runtime-result.json',JSON.stringify({status:'passed',runtime:'local workerd/Miniflare',checks:['actual D1 migrations','sessions','tenant isolation','optimistic concurrency','trusted server PDF',...(process.env.BROWSER_TEST!=='0'?['Chromium editor','offline encrypted edit/reload','server-confirmed reconnect persistence']:[])],browserExecuted:process.env.BROWSER_TEST!=='0',productionDeployment:false},null,2));
}catch(error){
 const diagnostic={status:'failed',stage,message:error.message,stack:error.stack,pageErrors:errors,consoleMessages,browserExecuted:Boolean(browser),productionDeployment:false};
 if(page){diagnostic.pageText=await page.locator('body').innerText().catch(()=>'<unavailable>');await page.screenshot({path:'artifacts/browser/failure.png',fullPage:true}).catch(()=>{});}
 await writeFile('artifacts/runtime-result.json',JSON.stringify(diagnostic,null,2));console.error(JSON.stringify(diagnostic,null,2));throw error;
}finally{await browser?.close();await mf.dispose();}

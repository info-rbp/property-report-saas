import { HttpError,json,jsonBody,text,safeId,emailAddress,sha256,randomToken,nowSeconds,limitedBytes,rateLimit } from './security.mjs';
import { membership,auditStatement } from './db.mjs';
import { requireRole,requireWritePlan,entitlement } from './plans.mjs';
import { getReport } from './reports.mjs';
import { readVerified,storeMirrored,discardUncommitted } from './storage.mjs';
import { renderExecutedPdf } from './renderer.mjs';
import { queueArchiveStatement } from './archive.mjs';
const CONSENT='I have reviewed the report identified by its SHA-256 digest and consent to sign this report electronically.';
const b64=bytes=>Buffer.from(bytes).toString('base64');
const unb64=value=>new Uint8Array(Buffer.from(value,'base64'));
async function encryptionKey(env){
  if(!/^[a-f0-9]{64}$/i.test(env.DELIVERY_ENCRYPTION_KEY||''))throw new HttpError(503,'Encrypted delivery storage is not configured.');
  return crypto.subtle.importKey('raw',new Uint8Array(Buffer.from(env.DELIVERY_ENCRYPTION_KEY,'hex')),'AES-GCM',false,['encrypt','decrypt']);
}
export async function seal(env,payload,context){const iv=crypto.getRandomValues(new Uint8Array(12)),key=await encryptionKey(env),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(context)},key,new TextEncoder().encode(JSON.stringify(payload)));return `${b64(iv)}.${b64(cipher)}`;}
export async function unseal(env,value,context){try{const [iv,cipher,extra]=value.split('.');if(extra)throw new Error('invalid envelope');const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:new TextEncoder().encode(context)},await encryptionKey(env),unb64(cipher));return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new HttpError(503,'Delivery data could not be authenticated.');}}
async function pdfObject(env,workspaceId,reportId,requestId){
  if(requestId){const record=await env.DB.prepare("SELECT * FROM signature_requests WHERE workspace_id=? AND id=? AND report_id=? AND status='completed'").bind(workspaceId,requestId,reportId).first();if(!record)throw new HttpError(409,'Executed PDF is not available.');return {workspace_id:workspaceId,report_id:reportId,object_key:record.executed_key,backup_key:record.executed_backup_key,sha256:record.executed_sha256,bytes:record.executed_bytes,mime_type:'application/pdf'};}
  const object=await env.DB.prepare("SELECT * FROM objects WHERE workspace_id=? AND report_id=? AND kind='pdf'").bind(workspaceId,reportId).first();if(!object)throw new HttpError(409,'The issued PDF is unavailable.');return object;
}
function outboxInsert(db,ws,delivery,id,encrypted,now){return db.prepare("INSERT OR IGNORE INTO email_outbox(id,workspace_id,delivery_id,encrypted_payload,next_attempt_at,created_at) VALUES(?,?,?,?,?,?)").bind(id,ws,delivery,encrypted,now,now);}
export async function resendReportMailer(env,payload,id){
  if(!env.RESEND_API_KEY||!env.EMAIL_FROM)throw new HttpError(503,'Verified outbound email is not configured.');
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`report-mail-${id}`},body:JSON.stringify({from:env.EMAIL_FROM,to:payload.to,cc:payload.cc,reply_to:payload.replyTo,subject:payload.subject,text:payload.text,attachments:payload.attachment?[{filename:payload.filename||'property-report.pdf',content:b64(payload.attachment)}]:undefined}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new HttpError(503,'The email provider has not accepted this message.');
  const result=JSON.parse(new TextDecoder().decode(await limitedBytes(response,65536)));
  if(typeof result.id!=='string')throw new HttpError(503,'The email provider returned an invalid receipt.');return result.id;
}
export async function drainOutbox(env,mailer=resendReportMailer,workspaceId=null){
  const now=nowSeconds();const rows=(await env.DB.prepare("SELECT * FROM email_outbox WHERE status='queued' AND next_attempt_at<=? AND (lease_until IS NULL OR lease_until<?) AND (? IS NULL OR workspace_id=?) ORDER BY created_at LIMIT 10").bind(now,now,workspaceId,workspaceId).all()).results;
  for(const row of rows){
    if(row.created_at<now-23*3600){await env.DB.prepare("UPDATE email_outbox SET status='review_required',last_error='idempotency_window_expired' WHERE id=? AND status='queued'").bind(row.id).run();continue;}
    const lease=randomToken();const acquired=await env.DB.prepare("UPDATE email_outbox SET lease_token=?,lease_until=?,attempts=attempts+1 WHERE id=? AND status='queued' AND (lease_until IS NULL OR lease_until<?)").bind(lease,now+60,row.id,now).run();if(!acquired.meta.changes)continue;
    try{
      const payload=await unseal(env,row.encrypted_payload,`${row.workspace_id}:${row.id}`);
      if(payload.attach){const object=await pdfObject(env,row.workspace_id,payload.reportId,payload.executedRequestId);payload.attachment=new Uint8Array(await (await readVerified(env,object)).arrayBuffer());}
      const providerId=await mailer(env,payload,row.id);
      await env.DB.prepare("UPDATE email_outbox SET status='accepted',provider_id=?,accepted_at=?,lease_token=NULL,lease_until=NULL,last_error=NULL WHERE id=? AND lease_token=?").bind(providerId,nowSeconds(),row.id,lease).run();
      await env.DB.prepare("UPDATE deliveries SET status='sent' WHERE workspace_id=? AND id=? AND status='queued' AND NOT EXISTS(SELECT 1 FROM email_outbox WHERE workspace_id=? AND delivery_id=? AND status='queued')").bind(row.workspace_id,row.delivery_id,row.workspace_id,row.delivery_id).run();
    }catch{
      await env.DB.prepare("UPDATE email_outbox SET next_attempt_at=?,lease_token=NULL,lease_until=NULL,last_error='provider_or_storage_unavailable' WHERE id=? AND lease_token=?").bind(nowSeconds()+Math.min(3600,30*2**Math.min(row.attempts,7)),row.id,lease).run();
    }
  }
}
function eligible(request,parties,party){
  if(party.signed_at)return true;
  const nonCounter=parties.filter(p=>!p.countersigner&&!p.signed_at),stage=nonCounter.length?nonCounter:parties.filter(p=>p.countersigner&&!p.signed_at);
  return stage.some(p=>p.id===party.id)&&(request.signing_order==='parallel'||party.sequence===Math.min(...stage.map(p=>p.sequence)));
}
async function ensureInvitations(env,request){
  const parties=(await env.DB.prepare('SELECT * FROM signature_parties WHERE workspace_id=? AND request_id=? ORDER BY sequence').bind(request.workspace_id,request.id).all()).results;
  const delivery=await env.DB.prepare('SELECT * FROM deliveries WHERE workspace_id=? AND id=?').bind(request.workspace_id,request.delivery_id).first();
  for(const party of parties.filter(p=>!p.signed_at&&eligible(request,parties,p))){
    const id=`invitation-${party.id}`,token=await unseal(env,party.token_encrypted,`${request.workspace_id}:${party.id}`);
    const payload={to:[party.email],subject:delivery.subject,text:`${party.name},\n\nPlease review and sign the property report:\n${env.APP_ORIGIN}/sign.html#token=${token}\n\nThis private link expires ${new Date(request.expires_at*1000).toISOString()}. Do not forward it.`,attach:false,reportId:request.report_id};
    await outboxInsert(env.DB,request.workspace_id,request.delivery_id,id,await seal(env,payload,`${request.workspace_id}:${id}`),nowSeconds()).run();
    await env.DB.prepare("UPDATE signature_parties SET status='invited' WHERE workspace_id=? AND id=? AND status='pending'").bind(request.workspace_id,party.id).run();
  }
}
function signatureImage(value){
  if(!value)return '';
  if(typeof value!=='string'||value.length>150000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value))throw new HttpError(400,'Invalid signature image.');
  const bytes=unb64(value.split(',')[1]);
  if(bytes.length<24||Buffer.from(bytes.subarray(0,8)).toString('hex')!=='89504e470d0a1a0a')throw new HttpError(400,'A PNG signature is required.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),w=view.getUint32(16),h=view.getUint32(20);
  if(!w||!h||w>1600||h>600)throw new HttpError(400,'Signature image dimensions exceed the limit.');return value;
}
function preparedFields(fields,partyIndex){
  return fields.filter(f=>Number(f.partyIndex||0)===partyIndex).map((field,i)=>{
    const type=field.fieldType==='text'?'text':'signature';
    const result={id:crypto.randomUUID(),fieldType:type,label:text(field.label|| (type==='text'?'Comment':'Signature'),120,true),promptText:text(field.promptText,500),placementLabel:text(field.placementLabel,200),required:field.required!==false};
    if(field.pageNumber!==undefined&&field.pageNumber!==null){
      if(!Number.isInteger(field.pageNumber)||field.pageNumber<1||field.pageNumber>2000)throw new HttpError(400,'Invalid signature page.');
      for(const key of ['xPercent','yPercent','widthPercent'])if(!Number.isFinite(field[key])||field[key]<0||field[key]>100)throw new HttpError(400,'Invalid signature placement.');
      if(field.widthPercent<1||field.xPercent+field.widthPercent>100||field.yPercent>90)throw new HttpError(400,'Signature placement is outside the page.');
      Object.assign(result,{pageNumber:field.pageNumber,xPercent:field.xPercent,yPercent:field.yPercent,widthPercent:field.widthPercent});
    }
    return result;
  });
}
export async function executeSignatureRequest(env,workspaceId,requestId){
  const request=await env.DB.prepare('SELECT * FROM signature_requests WHERE workspace_id=? AND id=?').bind(workspaceId,requestId).first();
  if(!request||['void','expired','completed'].includes(request.status))return;
  const parties=(await env.DB.prepare('SELECT * FROM signature_parties WHERE workspace_id=? AND request_id=? ORDER BY sequence').bind(workspaceId,requestId).all()).results;
  if(!parties.length||parties.some(p=>!p.signed_at)){
    if(request.expires_at<nowSeconds()){
      await env.DB.batch([env.DB.prepare("UPDATE signature_requests SET status='expired' WHERE workspace_id=? AND id=? AND status IN ('pending','partially_signed')").bind(workspaceId,requestId),env.DB.prepare("UPDATE email_outbox SET status='void' WHERE workspace_id=? AND delivery_id=? AND status='queued'").bind(workspaceId,request.delivery_id)]);return;
    }
    await ensureInvitations(env,request);return;
  }
  const lease=randomToken(),now=nowSeconds();
  const acquired=await env.DB.prepare("UPDATE signature_requests SET status='executing',execution_lease=?,execution_lease_until=? WHERE workspace_id=? AND id=? AND status IN ('pending','partially_signed','executing') AND (execution_lease_until IS NULL OR execution_lease_until<?)").bind(lease,now+180,workspaceId,requestId,now).run();if(!acquired.meta.changes)return;
  let object,committed=false;
  try{
    const pdf=await pdfObject(env,workspaceId,request.report_id);
    if(pdf.sha256!==request.issued_pdf_sha256)throw new HttpError(409,'Issued document integrity changed.');
    const record={id:requestId,pdfSha256:pdf.sha256,completedAt:new Date(now*1000).toISOString(),signers:parties.map(p=>({name:p.name,email:p.email,roleLabel:p.role_label,signedName:p.signed_name,signatureImage:p.signature_image,signatureHash:p.signature_hash,commentary:p.commentary,consentText:p.consent_text,signedAt:new Date(p.signed_at*1000).toISOString(),fields:JSON.parse(p.fields_json)}))};
    const bytes=await renderExecutedPdf(env,pdf,record);object=await storeMirrored(env,workspaceId,request.report_id,'executed',bytes,'application/pdf');
    const messages=[];
    for(const party of parties){const id=`executed-${requestId}-${party.id}`,payload={to:[party.email],subject:'Fully executed property report',text:`The fully signed property report is attached.\n\nOriginal PDF SHA-256: ${pdf.sha256}\nExecuted PDF SHA-256: ${object.sha256}`,attach:true,reportId:request.report_id,executedRequestId:requestId};messages.push(outboxInsert(env.DB,workspaceId,request.delivery_id,id,await seal(env,payload,`${workspaceId}:${id}`),now));}
    const access=await entitlement(env.DB,workspaceId);
    const results=await env.DB.batch([
      env.DB.prepare("INSERT INTO transaction_guards(id,approved) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM signature_requests WHERE workspace_id=? AND id=? AND status='executing' AND execution_lease=?) AND (SELECT COALESCE(SUM(bytes),0) FROM workspace_storage WHERE workspace_id=?)+?<=? THEN 1 ELSE 0 END").bind(lease,workspaceId,requestId,lease,workspaceId,object.bytes,access.limits.bytes),
      env.DB.prepare("UPDATE signature_requests SET status='completed',completed_at=?,executed_key=?,executed_backup_key=?,executed_sha256=?,executed_bytes=?,execution_lease=NULL,execution_lease_until=NULL WHERE workspace_id=? AND id=? AND execution_lease=?").bind(now,object.objectKey,object.backupKey,object.sha256,object.bytes,workspaceId,requestId,lease),
      env.DB.prepare("UPDATE deliveries SET status='completed',completed_at=? WHERE workspace_id=? AND id=?").bind(now,workspaceId,request.delivery_id),...messages,
      queueArchiveStatement(env.DB,workspaceId,request.report_id,object),
      env.DB.prepare('DELETE FROM transaction_guards WHERE id=?').bind(lease)
    ]);
    if(!results[1].meta.changes)throw new Error('execution conflict');committed=true;
    await auditStatement(env.DB,workspaceId,'system','signature.executed',requestId,{issuedPdfSha256:pdf.sha256,executedPdfSha256:object.sha256}).run();
  }catch(error){if(object&&!committed)await discardUncommitted(env,object);await env.DB.prepare('UPDATE signature_requests SET execution_lease_until=? WHERE workspace_id=? AND id=? AND execution_lease=?').bind(nowSeconds()+60,workspaceId,requestId,lease).run();throw error;}
}
async function deliveryView(env,ws,reportId){
  const rows=(await env.DB.prepare('SELECT id,kind,status,subject,created_at,completed_at FROM deliveries WHERE workspace_id=? AND report_id=? ORDER BY created_at DESC LIMIT 100').bind(ws,reportId).all()).results;
  for(const row of rows){row.messages=(await env.DB.prepare('SELECT status,attempts,accepted_at,delivered_at,last_error FROM email_outbox WHERE workspace_id=? AND delivery_id=?').bind(ws,row.id).all()).results;row.signature=await env.DB.prepare('SELECT id,status,expires_at,completed_at FROM signature_requests WHERE workspace_id=? AND delivery_id=?').bind(ws,row.id).first();if(row.signature)row.signature.parties=(await env.DB.prepare('SELECT id,name,email,role_label,status,signed_at FROM signature_parties WHERE workspace_id=? AND request_id=? ORDER BY sequence').bind(ws,row.signature.id).all()).results;}
  return rows;
}
export async function workflowRoutes(request,env,user,mailer=resendReportMailer){
  const url=new URL(request.url),parts=url.pathname.split('/').filter(Boolean),action=parts[3];
  if(parts[0]!=='api'||parts[1]!=='reports'||!parts[2]||!['deliveries','send','signature-request','signatures'].includes(action))return null;
  const wsId=request.headers.get('x-workspace-id')||url.searchParams.get('workspace');
  if(request.headers.get('x-workspace-id')&&url.searchParams.get('workspace')&&request.headers.get('x-workspace-id')!==url.searchParams.get('workspace'))throw new HttpError(400,'Conflicting workspace context.');
  const ws=await membership(env.DB,user.id,wsId),reportId=safeId(parts[2]),row=await getReport(env.DB,wsId,reportId);
  if(action==='deliveries'&&request.method==='GET')return json(await deliveryView(env,wsId,reportId));
  if(action==='signatures'&&parts[4]&&parts[5]==='pdf'&&request.method==='GET')return readVerified(env,await pdfObject(env,wsId,reportId,safeId(parts[4])));
  requireRole(ws.role,'write');
  if(action==='signatures'&&parts[4]&&parts[5]==='void'&&request.method==='POST'){
    const changed=await env.DB.prepare("UPDATE signature_requests SET status='void',revision=revision+1 WHERE workspace_id=? AND report_id=? AND id=? AND status<>'completed'").bind(wsId,reportId,safeId(parts[4])).run();if(!changed.meta.changes)throw new HttpError(409,'A completed signature request cannot be voided.');
    await env.DB.prepare("UPDATE email_outbox SET status='void' WHERE workspace_id=? AND delivery_id IN (SELECT delivery_id FROM signature_requests WHERE workspace_id=? AND id=?) AND status='queued'").bind(wsId,wsId,parts[4]).run();await auditStatement(env.DB,wsId,user.id,'signature.voided',parts[4]).run();return json({success:true});
  }
  await requireWritePlan(env.DB,wsId);
  if(request.method!=='POST'||!['send','signature-request'].includes(action))throw new HttpError(405,'Method not allowed.');
  if(row.status!=='completed')throw new HttpError(409,'Finalise the report before sending it.');
  const body=await jsonBody(request,65536),key=safeId(request.headers.get('idempotency-key')||''),now=nowSeconds();
  await rateLimit(env.DB,`delivery:${wsId}`,100,3600);
  const requestHash=await sha256(JSON.stringify({action,reportId,body}));
  const existing=await env.DB.prepare('SELECT * FROM deliveries WHERE workspace_id=? AND request_key=?').bind(wsId,key).first();
  if(existing){if(existing.payload_hash!==requestHash)throw new HttpError(409,'Idempotency key was used for different content.');return json({id:existing.id,status:existing.status,replayed:true});}
  const subject=text(body.subject||`Property report - ${JSON.parse(row.report_data).details.propertyAddress}`,200,true),message=text(body.message,10000),id=crypto.randomUUID();
  const statements=[env.DB.prepare('INSERT INTO deliveries(workspace_id,id,report_id,request_key,payload_hash,kind,subject,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(wsId,id,reportId,key,requestHash,action==='send'?'send':'signature',subject,user.id,now)];
  if(action==='send'){
    if(!Array.isArray(body.to)||body.to.length<1||body.to.length>10||!Array.isArray(body.cc||[])||(body.cc||[]).length>10)throw new HttpError(400,'Provide 1 to 10 recipients.');
    const payload={to:body.to.map(p=>emailAddress(typeof p==='string'?p:p.email)),cc:(body.cc||[]).map(emailAddress),replyTo:user.email,subject,text:message,attach:true,reportId};
    const mailId=crypto.randomUUID();statements.push(outboxInsert(env.DB,wsId,id,mailId,await seal(env,payload,`${wsId}:${mailId}`),now));
  }else{
    if(!Array.isArray(body.parties)||body.parties.length<1||body.parties.length>10||!['sequential','parallel'].includes(body.signingOrder))throw new HttpError(400,'Provide valid signing parties and signing order.');
    const fields=body.fields||[];if(!Array.isArray(fields)||fields.length>50)throw new HttpError(400,'Too many signing fields.');
    if(fields.some(f=>!Number.isInteger(f.partyIndex??0)||(f.partyIndex??0)<0||(f.partyIndex??0)>=body.parties.length))throw new HttpError(400,'Signing fields must belong to a signing party.');
    const requestId=crypto.randomUUID(),days=body.expiresInDays??14;if(!Number.isInteger(days)||days<1||days>90)throw new HttpError(400,'Signing expiry must be between 1 and 90 days.');
    const pdf=await pdfObject(env,wsId,reportId);const emails=new Set();
    if(fields.some(f=>f.pageNumber)){
      const module=await import('../../generated/server-renderer.mjs');
      const count=await module.pdfPageCount(new Uint8Array(await (await readVerified(env,pdf)).arrayBuffer()));
      if(fields.some(f=>f.pageNumber>count))throw new HttpError(400,'A mapped signature page does not exist in the issued report.');
    }
    statements.push(env.DB.prepare('INSERT INTO signature_requests(workspace_id,id,report_id,delivery_id,signing_order,issued_pdf_sha256,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(wsId,requestId,reportId,id,body.signingOrder,pdf.sha256,now+days*86400,now));
    for(let index=0;index<body.parties.length;index++){
      const input=body.parties[index],email=emailAddress(input.email);if(emails.has(email))throw new HttpError(400,'Each signing party must use a distinct email address.');emails.add(email);
      const partyId=crypto.randomUUID(),token=randomToken(),partyFields=preparedFields(fields,index);
      statements.push(env.DB.prepare('INSERT INTO signature_parties(workspace_id,request_id,id,name,email,role_label,sequence,countersigner,token_hash,token_encrypted,fields_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(wsId,requestId,partyId,text(input.name,160,true),email,text(input.roleLabel||'Signatory',120),index+1,input.isCountersigner?1:0,await sha256(token),await seal(env,token,`${wsId}:${partyId}`),JSON.stringify(partyFields),now));
    }
  }
  await env.DB.batch(statements);await auditStatement(env.DB,wsId,user.id,action==='send'?'report.delivery_queued':'signature.requested',id).run();
  if(action==='signature-request'){const sr=await env.DB.prepare('SELECT * FROM signature_requests WHERE workspace_id=? AND delivery_id=?').bind(wsId,id).first();await ensureInvitations(env,sr);}
  await drainOutbox(env,mailer,wsId);return json((await deliveryView(env,wsId,reportId)).find(d=>d.id===id),201);
}
export async function publicSigningRoutes(request,env,mailer=resendReportMailer){
  const url=new URL(request.url);if(!url.pathname.startsWith('/api/public/signing'))return null;
  const token=request.headers.get('x-signing-token');if(!/^[a-f0-9]{64}$/.test(token||''))throw new HttpError(404,'Signing link not found.');
  await rateLimit(env.DB,`sign-ip:${await sha256(request.headers.get('cf-connecting-ip')||'local')}`,1000,300);const tokenHash=await sha256(token);
  const party=await env.DB.prepare('SELECT * FROM signature_parties WHERE token_hash=?').bind(tokenHash).first();if(!party)throw new HttpError(404,'Signing link not found.');await rateLimit(env.DB,`sign:${tokenHash}`,120,300);
  const sr=await env.DB.prepare('SELECT * FROM signature_requests WHERE workspace_id=? AND id=?').bind(party.workspace_id,party.request_id).first();
  if(!sr||sr.status==='void'||sr.expires_at<nowSeconds())throw new HttpError(410,'Signing link has expired or been withdrawn.');
  const parties=(await env.DB.prepare('SELECT * FROM signature_parties WHERE workspace_id=? AND request_id=? ORDER BY sequence').bind(sr.workspace_id,sr.id).all()).results;
  if(!eligible(sr,parties,party))throw new HttpError(409,'A preceding signatory must complete their step first.');
  if(url.pathname==='/api/public/signing/pdf'&&request.method==='GET')return readVerified(env,await pdfObject(env,sr.workspace_id,sr.report_id));
  if(url.pathname==='/api/public/signing/executed'&&request.method==='GET')return readVerified(env,await pdfObject(env,sr.workspace_id,sr.report_id,sr.id));
  if(url.pathname==='/api/public/signing'&&request.method==='GET'){
    const row=await getReport(env.DB,sr.workspace_id,sr.report_id);
    return json({id:sr.id,status:sr.status,pdfSha256:sr.issued_pdf_sha256,expiresAt:sr.expires_at,name:party.name,email:party.email,roleLabel:party.role_label,signed:!!party.signed_at,fields:JSON.parse(party.fields_json),consentText:CONSENT,propertyAddress:JSON.parse(row.report_data).details.propertyAddress});
  }
  if(url.pathname!=='/api/public/signing/submit'||request.method!=='POST')throw new HttpError(405,'Method not allowed.');
  const body=await jsonBody(request,200000);if(body.consent!==true||body.pdfSha256!==sr.issued_pdf_sha256)throw new HttpError(400,'Review the current PDF and explicitly consent before signing.');
  const signedName=text(body.signedName,160,true),image=signatureImage(body.signatureImage),commentary=text(body.commentary,5000),fields=JSON.parse(party.fields_json).map(f=>({...f,value:f.fieldType==='signature'?signedName:text(body.fieldValues?.[f.id],5000)}));
  if(image){try{await (await import('../../generated/server-renderer.mjs')).validateSignaturePng(image);}catch{throw new HttpError(400,'The signature image could not be decoded. Draw it again.');}}
  if(fields.some(f=>f.required&&!f.value))throw new HttpError(400,'Complete every required signing field.');
  const hash=await sha256(JSON.stringify({signedName,image,commentary,fields,pdfSha256:sr.issued_pdf_sha256,consent:CONSENT}));
  if(party.signed_at){if(party.signature_hash!==hash)throw new HttpError(409,'This signature is already recorded and cannot be changed.');await executeSignatureRequest(env,sr.workspace_id,sr.id);return json({signed:true,replayed:true});}
  const now=nowSeconds(),writeToken=randomToken();
  const results=await env.DB.batch([
    env.DB.prepare("UPDATE signature_requests SET revision=revision+1,write_token=?,status='partially_signed' WHERE workspace_id=? AND id=? AND revision=? AND status IN ('pending','partially_signed') AND expires_at>=?").bind(writeToken,sr.workspace_id,sr.id,sr.revision,now),
    env.DB.prepare("UPDATE signature_parties SET status='signed',signed_name=?,signature_image=?,signature_hash=?,commentary=?,fields_json=?,consent_text=?,signed_at=? WHERE workspace_id=? AND id=? AND signed_at IS NULL AND EXISTS(SELECT 1 FROM signature_requests WHERE workspace_id=? AND id=? AND write_token=?)").bind(signedName,image,hash,commentary,JSON.stringify(fields),CONSENT,now,sr.workspace_id,party.id,sr.workspace_id,sr.id,writeToken)
  ]);
  if(!results[0].meta.changes||!results[1].meta.changes)throw new HttpError(409,'Signing state changed. Refresh and try again.');
  await auditStatement(env.DB,sr.workspace_id,`signer:${party.id}`,'signature.recorded',sr.id,{pdfSha256:sr.issued_pdf_sha256,signatureHash:hash}).run();
  // A rendering or email outage must not discard a successfully recorded signature.
  try{await executeSignatureRequest(env,sr.workspace_id,sr.id);}catch{console.error(JSON.stringify({event:'execution_retry_required',requestId:sr.id}));}
  await drainOutbox(env,mailer,sr.workspace_id);
  const updated=await env.DB.prepare('SELECT status FROM signature_requests WHERE workspace_id=? AND id=?').bind(sr.workspace_id,sr.id).first();return json({signed:true,status:updated.status});
}
export async function resendWebhook(request,env){
  if(new URL(request.url).pathname!=='/api/email/webhook'||request.method!=='POST')return null;
  if(!env.RESEND_WEBHOOK_SECRET)throw new HttpError(503,'Email webhook verification is not configured.');
  const id=request.headers.get('svix-id')||'',timestamp=request.headers.get('svix-timestamp')||'',signature=request.headers.get('svix-signature')||'';
  if(!/^[A-Za-z0-9_-]{1,200}$/.test(id)||!/^\d+$/.test(timestamp)||Math.abs(nowSeconds()-Number(timestamp))>300)throw new HttpError(400,'Invalid email webhook.');
  const raw=await limitedBytes(request,1024*1024),signed=new TextEncoder().encode(`${id}.${timestamp}.${new TextDecoder().decode(raw)}`),key=await crypto.subtle.importKey('raw',unb64(env.RESEND_WEBHOOK_SECRET.replace(/^whsec_/,'')),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  let valid=false;for(const part of signature.split(' ')){const [version,value]=part.split(',');if(version==='v1'&&value&&await crypto.subtle.verify('HMAC',key,unb64(value),signed))valid=true;}
  if(!valid)throw new HttpError(400,'Invalid email webhook signature.');
  const event=JSON.parse(new TextDecoder().decode(raw));const receipt=await env.DB.prepare('SELECT id FROM email_webhook_events WHERE id=?').bind(id).first();if(receipt)return json({received:true,replayed:true});
  const status={'email.delivered':'delivered','email.bounced':'bounced','email.complained':'complained','email.failed':'failed'}[event.type];
  const statements=[env.DB.prepare('INSERT INTO email_webhook_events(id,created_at) VALUES(?,?)').bind(id,nowSeconds())];
  if(status&&typeof event.data?.email_id==='string')statements.push(env.DB.prepare("UPDATE email_outbox SET status=?,delivered_at=CASE WHEN ?='delivered' THEN ? ELSE delivered_at END WHERE provider_id=? AND status NOT IN ('bounced','complained','failed')").bind(status,status,nowSeconds(),event.data.email_id));
  await env.DB.batch(statements);return json({received:true});
}
export async function resumeWorkflows(env,mailer=resendReportMailer){
  const requests=(await env.DB.prepare("SELECT workspace_id,id FROM signature_requests WHERE status IN ('pending','partially_signed','executing') ORDER BY COALESCE(last_checked_at,0),created_at LIMIT 50").all()).results;
  for(const row of requests){await env.DB.prepare('UPDATE signature_requests SET last_checked_at=? WHERE workspace_id=? AND id=?').bind(nowSeconds(),row.workspace_id,row.id).run();try{await executeSignatureRequest(env,row.workspace_id,row.id);}catch{console.error(JSON.stringify({event:'execution_retry_required',requestId:row.id}));}}
  await drainOutbox(env,mailer);
}

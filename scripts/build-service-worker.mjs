import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const assets=(await readdir('dist/assets')).filter(x=>/\.(js|css)$/.test(x)).map(x=>'/assets/'+x);
const shell=['/editor.html',...assets],hash=createHash('sha256');
hash.update('canonical-editor-route-v2');
for(const file of shell)hash.update(await readFile('dist'+file));
const version=hash.digest('hex').slice(0,16);
await writeFile('dist/sw.js',`
const CACHE='pr-static-${version}',ASSETS=${JSON.stringify(shell)};
const editorPaths=new Set(['/editor','/editor/','/editor.html']);
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 for(const path of ASSETS){
  const response=await fetch(new Request(path,{cache:'reload',credentials:'same-origin'}));
  if(!response.ok)throw new Error('Application shell could not be cached.');
  // Cloudflare may redirect /editor.html to /editor. Store a fresh response so
  // offline navigations do not inherit redirected response metadata.
  await cache.put(path,new Response(await response.arrayBuffer(),{status:response.status,statusText:response.statusText,headers:response.headers}));
 }
})()));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('pr-static-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url);
 if(u.origin!==self.location.origin||event.request.method!=='GET'||u.pathname.startsWith('/api/'))return;
 const path=editorPaths.has(u.pathname)?'/editor.html':u.pathname;
 if(!ASSETS.includes(path))return;
 event.respondWith((async()=>{
  // Only the public application shell is cached. Report/API data stays in the
  // session-key-encrypted, user/workspace-scoped IndexedDB store.
  if(path!=='/editor.html'){
   const cached=await caches.match(path);if(cached)return cached;
  }
  try{return await fetch(event.request);}
  catch{return (await caches.match(path))||Response.error();}
 })());
});
`);
await writeFile('dist/manifest.webmanifest',JSON.stringify({name:'Property Reports Cloud',short_name:'Reports',start_url:'/',display:'standalone',background_color:'#edf1f5',theme_color:'#143e59',icons:[{src:'/app-icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]}));

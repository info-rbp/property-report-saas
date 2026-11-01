import {verifyArchive,digest} from '../src/shared/archive-envelope.mjs';
// Deploy in a separately controlled account. This upload credential cannot read or delete archived data.
export default {
 async fetch(request,env){
  const url=new URL(request.url),id=url.pathname.split('/')[2];
  if(url.pathname==='/health'&&request.method==='GET')return Response.json({status:'ok'});
  if(request.method!=='PUT'||!/^\/archive\/[a-f0-9]{64}$/.test(url.pathname))return new Response('Not found',{status:404});
  const at=request.headers.get('x-archive-timestamp'),hash=request.headers.get('x-archive-sha256'),signature=request.headers.get('x-archive-signature');
  if(!/^\d{10}$/.test(at||'')||Math.abs(Date.now()/1000-Number(at))>300||!/^[a-f0-9]{64}$/.test(hash||'')||!await verifyArchive(env.UPLOAD_KEY,at,url.pathname,hash,signature))return new Response('Unauthorized',{status:401});
  const declared=Number(request.headers.get('content-length')||0);if(declared>280*1024*1024)return new Response('Too large',{status:413});
  // Application object envelopes are capped at 24 MB. Database snapshots use multipart/offline archive upload for larger exports.
  const limit=24*1024*1024,reader=request.body?.getReader();if(!reader)return new Response('Body required',{status:400});let size=0;const chunks=[];
  for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>limit){await reader.cancel();return new Response('Use the documented large-backup procedure',{status:413});}chunks.push(r.value);}
  const body=new Uint8Array(size);let i=0;for(const chunk of chunks){body.set(chunk,i);i+=chunk.length;}if(await digest(body)!==hash)return new Response('Checksum mismatch',{status:400});
  const key=`immutable/${id}`;let existing=await env.ARCHIVE.head(key);
  if(!existing){await env.ARCHIVE.put(key,body,{onlyIf:{etagDoesNotMatch:'*'},customMetadata:{sha256:hash},httpMetadata:{contentType:'application/octet-stream'}});existing=await env.ARCHIVE.head(key);}
  if(!existing||existing.customMetadata?.sha256!==hash||existing.size!==size)return new Response('Immutable object conflict',{status:409});
  return Response.json({id,sha256:hash,bytes:size},{status:201,headers:{'Cache-Control':'no-store'}});
 }
};

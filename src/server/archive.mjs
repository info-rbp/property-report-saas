import {nowSeconds,HttpError,json} from './security.mjs';
import {membership} from './db.mjs';
import {requireRole} from './plans.mjs';
import {readVerified} from './storage.mjs';
import {packArchive,unpackArchive,signArchive,digest} from '../shared/archive-envelope.mjs';
export function queueArchiveStatement(db,ws,reportId,object){return db.prepare('INSERT OR IGNORE INTO archive_jobs(workspace_id,id,report_id,object_key,backup_key,sha256,bytes,mime_type,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM objects WHERE workspace_id=? AND id=? UNION SELECT 1 FROM workspace_assets WHERE workspace_id=? AND id=? UNION SELECT 1 FROM signature_requests WHERE workspace_id=? AND executed_key=?)').bind(ws,object.id,reportId,object.objectKey,object.backupKey,object.sha256,object.bytes,object.mime,nowSeconds(),ws,object.id,ws,object.id,ws,object.objectKey);}
export async function sendArchive(env,id,envelope,fetcher=fetch){
 const base=new URL(env.ARCHIVE_ORIGIN);if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw new Error('Invalid independent archive origin.');
 if(base.origin===new URL(env.APP_ORIGIN).origin)throw new Error('Archive must use a separate origin.');
 const path=`/archive/${encodeURIComponent(id)}`,hash=await digest(envelope),timestamp=String(nowSeconds());
 const response=await fetcher(new URL(path,base),{method:'PUT',headers:{'Content-Type':'application/octet-stream','X-Archive-Timestamp':timestamp,'X-Archive-SHA256':hash,'X-Archive-Signature':await signArchive(env.ARCHIVE_UPLOAD_KEY,timestamp,path,hash)},body:envelope,signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error('Independent archive did not accept the envelope.');
 const receipt=await response.json();if(receipt.sha256!==hash||receipt.bytes!==envelope.length)throw new Error('Archive receipt did not match uploaded ciphertext.');return receipt;
}
export async function drainArchive(env,fetcher=fetch){
 if(!env.ARCHIVE_ORIGIN||!env.ARCHIVE_ENCRYPTION_KEY||!env.ARCHIVE_UPLOAD_KEY||!env.ARCHIVE_KEY_ID)return;
 const now=nowSeconds(),jobs=(await env.DB.prepare("SELECT * FROM archive_jobs WHERE status='queued' AND next_attempt_at<=? AND (lease_until IS NULL OR lease_until<?) ORDER BY created_at LIMIT 10").bind(now,now).all()).results;
 for(const job of jobs){const lease=crypto.randomUUID(),locked=await env.DB.prepare("UPDATE archive_jobs SET lease_token=?,lease_until=?,attempts=attempts+1 WHERE workspace_id=? AND id=? AND status='queued' AND (lease_until IS NULL OR lease_until<?)").bind(lease,now+90,job.workspace_id,job.id,now).run();if(!locked.meta.changes)continue;
  try{
   const scope=`${job.workspace_id}:${job.id}`,archiveId=await digest(new TextEncoder().encode(scope)),envelopeKey=`archive-envelopes/${archiveId}`;
   let stored=await env.BACKUPS.get(envelopeKey),envelope;
   if(stored){envelope=new Uint8Array(await stored.arrayBuffer());const decoded=await unpackArchive(envelope,env.ARCHIVE_ENCRYPTION_KEY);if(decoded.manifest.sha256!==job.sha256||decoded.manifest.workspaceId!==job.workspace_id)throw new Error('Envelope identity mismatch.');}
   else{
    let original;
    try{original=new Uint8Array(await (await readVerified(env,job)).arrayBuffer());}
    catch(error){const exists=await env.DB.prepare('SELECT 1 AS present FROM objects WHERE workspace_id=? AND id=? UNION SELECT 1 FROM workspace_assets WHERE workspace_id=? AND id=? UNION SELECT 1 FROM signature_requests WHERE workspace_id=? AND executed_key=? LIMIT 1').bind(job.workspace_id,job.id,job.workspace_id,job.id,job.workspace_id,job.object_key).first();if(!exists){await env.DB.prepare("UPDATE archive_jobs SET status='cancelled',last_error='source_deleted_before_archive' WHERE workspace_id=? AND id=?").bind(job.workspace_id,job.id).run();continue;}throw error;}
    envelope=await packArchive(original,{kind:'object',workspaceId:job.workspace_id,reportId:job.report_id,objectId:job.id,primaryKey:job.object_key,backupKey:job.backup_key,mime:job.mime_type,createdAt:job.created_at},env.ARCHIVE_ENCRYPTION_KEY,env.ARCHIVE_KEY_ID);
    await env.BACKUPS.put(envelopeKey,envelope,{httpMetadata:{contentType:'application/octet-stream'}});
   }
   const receipt=await sendArchive(env,archiveId,envelope,fetcher);
   await env.DB.batch([env.DB.prepare("UPDATE archive_jobs SET status='archived',archived_at=?,archive_id=?,envelope_sha256=?,last_error=NULL,lease_until=NULL WHERE workspace_id=? AND id=? AND lease_token=?").bind(nowSeconds(),archiveId,receipt.sha256,job.workspace_id,job.id,lease),env.DB.prepare("INSERT INTO backup_status(kind,completed_at,manifest_sha256,reference) VALUES('object-archive',?,?,?) ON CONFLICT(kind) DO UPDATE SET completed_at=excluded.completed_at,manifest_sha256=excluded.manifest_sha256,reference=excluded.reference").bind(nowSeconds(),receipt.sha256,archiveId)]);
  }catch{await env.DB.prepare("UPDATE archive_jobs SET last_error='archive_retry_required',next_attempt_at=?,lease_until=NULL WHERE workspace_id=? AND id=? AND lease_token=?").bind(nowSeconds()+Math.min(3600,30*2**Math.min(job.attempts,7)),job.workspace_id,job.id,lease).run();console.error(JSON.stringify({event:'independent_archive_failed',objectId:job.id}));}
 }
}
export async function archiveRoutes(request,env,user){const p=new URL(request.url).pathname.split('/').filter(Boolean);if(p[0]!=='api'||p[1]!=='workspaces'||p[3]!=='backup-status'||request.method!=='GET')return null;const ws=await membership(env.DB,user.id,p[2]);requireRole(ws.role,'owner');const jobs=await env.DB.prepare('SELECT status,COUNT(*) AS count,MIN(created_at) AS oldest FROM archive_jobs WHERE workspace_id=? GROUP BY status').bind(ws.id).all();return json({independentArchiveConfigured:!!(env.ARCHIVE_ORIGIN&&env.ARCHIVE_ENCRYPTION_KEY&&env.ARCHIVE_UPLOAD_KEY&&env.ARCHIVE_KEY_ID),jobs:jobs.results,notice:'Configuration and receipts do not by themselves prove independent account control or a completed recovery drill.'});}

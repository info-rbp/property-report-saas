import {mkdtemp,readFile,rm,writeFile,mkdir} from 'node:fs/promises';import {createReadStream} from 'node:fs';import {createHash,randomUUID} from 'node:crypto';import {tmpdir} from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {packArchive,digest} from '../src/shared/archive-envelope.mjs';import {sendArchive} from '../src/server/archive.mjs';
for(const name of ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','BACKUP_DATABASE','ARCHIVE_ENCRYPTION_KEY','ARCHIVE_UPLOAD_KEY','ARCHIVE_KEY_ID','ARCHIVE_ORIGIN','APP_ORIGIN'])if(!process.env[name])throw new Error(`${name} is required in the protected backup environment.`);
const dir=await mkdtemp(path.join(tmpdir(),'pr-backup-'));
try{
 const output=path.join(dir,'database.sql'),result=spawnSync('node',['node_modules/wrangler/bin/wrangler.js','d1','export',process.env.BACKUP_DATABASE,'--remote','--output',output],{encoding:'utf8',maxBuffer:1024*1024,env:process.env});
 if(result.status!==0)throw new Error('Database export failed. No successful snapshot receipt was created.');
 const snapshotId=randomUUID(),createdAt=new Date().toISOString(),hash=createHash('sha256'),parts=[];let totalBytes=0,index=0;
 for await(const chunk of createReadStream(output,{highWaterMark:8*1024*1024})){
  const raw=new Uint8Array(chunk);hash.update(raw);totalBytes+=raw.length;
  const envelope=await packArchive(raw,{kind:'database-chunk',snapshotId,index},process.env.ARCHIVE_ENCRYPTION_KEY,process.env.ARCHIVE_KEY_ID),id=await digest(new TextEncoder().encode(`${snapshotId}:${index}`));
  const receipt=await sendArchive(process.env,id,envelope);parts.push({id,index,sha256:await digest(raw),bytes:raw.length,envelopeSha256:receipt.sha256});index++;
 }
 const manifest={snapshotId,database:process.env.BACKUP_DATABASE,createdAt,sha256:hash.digest('hex'),bytes:totalBytes,parts};
 const envelope=await packArchive(new TextEncoder().encode(JSON.stringify(manifest)),{kind:'database-manifest',snapshotId,createdAt},process.env.ARCHIVE_ENCRYPTION_KEY,process.env.ARCHIVE_KEY_ID),id=await digest(new TextEncoder().encode(`snapshot:${snapshotId}`)),receipt=await sendArchive(process.env,id,envelope);
 await mkdir('artifacts',{recursive:true});await writeFile('artifacts/database-backup-receipt.json',JSON.stringify({...receipt,createdAt,kind:'database-manifest',keyId:process.env.ARCHIVE_KEY_ID,parts:parts.length,plaintextBytes:totalBytes},null,2));
 const receiptSql=path.join(dir,'receipt.sql');await writeFile(receiptSql,`INSERT INTO backup_status(kind,completed_at,manifest_sha256,reference) VALUES('database-archive',${Math.floor(Date.now()/1000)},'${receipt.sha256}','${id}') ON CONFLICT(kind) DO UPDATE SET completed_at=excluded.completed_at,manifest_sha256=excluded.manifest_sha256,reference=excluded.reference;`,{mode:0o600});
 const recorded=spawnSync('node',['node_modules/wrangler/bin/wrangler.js','d1','execute',process.env.BACKUP_DATABASE,'--remote','--file',receiptSql],{encoding:'utf8',env:process.env});
 if(recorded.status!==0)throw new Error('Encrypted archive exists, but recording its health receipt failed. Keep the artifact and investigate.');
 console.log('Encrypted chunked database snapshot archived. The complete manifest was published only after all chunks were acknowledged.');
}finally{await rm(dir,{recursive:true,force:true});}

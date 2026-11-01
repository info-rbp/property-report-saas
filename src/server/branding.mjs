import {HttpError,json,limitedBytes,safeId,nowSeconds,jsonBody,text} from './security.mjs';
import {membership,auditStatement} from './db.mjs';
import {requireRole,requireWritePlan} from './plans.mjs';
import {storeMirrored,discardUncommitted,readVerified,jpegDimensions,restoreVerified} from './storage.mjs';
import {queueArchiveStatement} from './archive.mjs';
export async function brandingRoutes(request,env,user){
  const parts=new URL(request.url).pathname.split('/').filter(Boolean);
  if(parts[0]!=='api'||parts[1]!=='workspaces'||!parts[2]||!['assets','logo','closure'].includes(parts[3]))return null;
  const wsId=safeId(parts[2]);if(request.headers.get('x-workspace-id')&&request.headers.get('x-workspace-id')!==wsId)throw new HttpError(400,'Workspace scope mismatch.');const ws=await membership(env.DB,user.id,wsId),brand=JSON.parse(ws.branding_json||'{}');
  if(parts[3]==='assets'&&parts[4]){
    const row=await env.DB.prepare('SELECT * FROM workspace_assets WHERE workspace_id=? AND id=?').bind(wsId,safeId(parts[4])).first();
    if(!row)throw new HttpError(404,'Brand asset not found.');
    if(parts[5]==='restore'&&request.method==='POST'){requireRole(ws.role,'owner');await restoreVerified(env,{...row,report_id:'branding'});await auditStatement(env.DB,wsId,user.id,'brand.asset_restored',row.id).run();return json({success:true});}
    if(request.method!=='GET')throw new HttpError(405,'Method not allowed.');
    return readVerified(env,{...row,report_id:'branding'});
  }
  requireRole(ws.role,'admin');
  if(parts[3]==='logo'&&request.method==='POST'){
    const access=await requireWritePlan(env.DB,wsId),bytes=await limitedBytes(request,1024*1024);jpegDimensions(bytes);
    const object=await storeMirrored(env,wsId,'branding','logo',bytes,'image/jpeg');
    try{
      const updated={...brand,companyLogoAssetId:object.id};
      await env.DB.batch([
        env.DB.prepare('INSERT INTO transaction_guards(id,approved) SELECT ?,CASE WHEN (SELECT COALESCE(SUM(bytes),0) FROM workspace_storage WHERE workspace_id=?)+?<=? AND (SELECT COALESCE(SUM(bytes),0) FROM workspace_assets WHERE workspace_id=?)+?<=? THEN 1 ELSE 0 END').bind(object.id,wsId,bytes.length,access.limits.bytes,wsId,bytes.length,20*1024*1024),
        env.DB.prepare('INSERT INTO workspace_assets(workspace_id,id,object_key,backup_key,sha256,bytes,mime_type,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(wsId,object.id,object.objectKey,object.backupKey,object.sha256,object.bytes,object.mime,nowSeconds()),
        env.DB.prepare('UPDATE workspaces SET branding_json=? WHERE id=?').bind(JSON.stringify(updated),wsId),queueArchiveStatement(env.DB,wsId,'branding',object),auditStatement(env.DB,wsId,user.id,'brand.logo_uploaded',object.id),env.DB.prepare('DELETE FROM transaction_guards WHERE id=?').bind(object.id)
      ]);return json(updated,201);
    }catch(e){await discardUncommitted(env,object);if(/transaction_guard_failed/.test(e.message||''))throw new HttpError(409,'Brand asset or workspace storage allowance reached. Historical report logos are retained.');throw e;}
  }
  if(parts[3]==='logo'&&request.method==='DELETE'){
    delete brand.companyLogoAssetId;
    await env.DB.batch([env.DB.prepare('UPDATE workspaces SET branding_json=? WHERE id=?').bind(JSON.stringify(brand),wsId),auditStatement(env.DB,wsId,user.id,'brand.logo_detached',wsId)]);return json(brand);
  }
  if(parts[3]==='closure'){
    requireRole(ws.role,'owner');
    if(request.method==='GET')return json((await env.DB.prepare('SELECT id,reason,status,requested_at FROM closure_requests WHERE workspace_id=? ORDER BY requested_at DESC').bind(wsId).all()).results);
    if(request.method==='POST'){const body=await jsonBody(request,4096);if(body.confirm!==true)throw new HttpError(400,'Confirm the closure review request.');const id=crypto.randomUUID();await env.DB.batch([env.DB.prepare("INSERT INTO closure_requests(workspace_id,id,reason,requested_by,requested_at) VALUES(?,?,?,?,?)").bind(wsId,id,text(body.reason,1000,true),user.id,nowSeconds()),auditStatement(env.DB,wsId,user.id,'workspace.closure_review_requested',id)]);return json({id,status:'pending_review',notice:'No data has been erased. Retention and subscription cancellation are reviewed separately.'},202);}
  }
  throw new HttpError(405,'Method not allowed.');
}

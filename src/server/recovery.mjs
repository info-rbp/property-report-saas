import { HttpError, json, jsonBody, nowSeconds, safeId } from './security.mjs';
import { membership, auditStatement } from './db.mjs';
import { requireRole } from './plans.mjs';
import { assertObjectScope, restoreVerified } from './storage.mjs';
// These statements are used inside the SAME atomic transaction as the revision check and manifest removal.
export function cleanupStatements(db, workspaceId, reportId, actorId, writeToken, objectId = null) {
    const filter = `workspace_id=? AND report_id=? ${objectId ? 'AND id=?' : ''}
    AND EXISTS(SELECT 1 FROM reports WHERE workspace_id=? AND id=? AND write_token=?)`;
    const args = [workspaceId, reportId, ...(objectId ? [objectId] : []), workspaceId, reportId, writeToken];
    return [
        db.prepare(`INSERT INTO recovery_records(workspace_id,object_id,report_id,object_key,backup_key,sha256,bytes,mime_type,metadata_json,removed_at,removed_by)
      SELECT workspace_id,id,report_id,object_key,backup_key,sha256,bytes,mime_type,metadata_json,?,? FROM objects WHERE ${filter}`)
            .bind(nowSeconds(), actorId, ...args),
        db.prepare(`INSERT INTO storage_cleanup(workspace_id,object_id,object_key,report_id,queued_at)
      SELECT workspace_id,id,object_key,report_id,? FROM objects WHERE ${filter}`)
            .bind(nowSeconds(), ...args)
    ];
}
export async function drainCleanup(env, workspaceId = null) {
    // Retention holds are rechecked when draining. The recovery bucket is never expired here.
    const query = `SELECT c.* FROM storage_cleanup c JOIN workspaces w ON w.id=c.workspace_id
    WHERE c.completed_at IS NULL AND w.legal_hold=0 ${workspaceId ? 'AND c.workspace_id=?' : ''}
    ORDER BY c.queued_at LIMIT 50`;
    const statement = env.DB.prepare(query), rows = (await (workspaceId ? statement.bind(workspaceId) : statement).all()).results;
    let completed = 0;
    for (const row of rows) {
        try {
            assertObjectScope(row.object_key, row.workspace_id, row.report_id);
            await env.FILES.delete(row.object_key);
            await env.DB.prepare('UPDATE storage_cleanup SET completed_at=?,attempts=attempts+1 WHERE workspace_id=? AND object_id=? AND completed_at IS NULL').bind(nowSeconds(), row.workspace_id, row.object_id).run();
            completed++;
        }
        catch {
            await env.DB.prepare('UPDATE storage_cleanup SET attempts=attempts+1 WHERE workspace_id=? AND object_id=? AND completed_at IS NULL').bind(row.workspace_id, row.object_id).run();
        }
    }
    return { completed, examined: rows.length };
}
export async function recoveryRoutes(request, env, user) {
    const parts = new URL(request.url).pathname.split('/').filter(Boolean);
    if(parts[0]==='api'&&parts[1]==='recovery'&&parts[2]==='objects'&&parts.length===3&&request.method==='GET'){
        const ws=await membership(env.DB,user.id,request.headers.get('x-workspace-id'));requireRole(ws.role,'owner');const url=new URL(request.url),reportId=url.searchParams.get('reportId');
        const rows=await env.DB.prepare('SELECT id,report_id,kind,bytes,sha256 FROM objects WHERE workspace_id=? AND report_id=? ORDER BY id LIMIT 500').bind(ws.id,safeId(reportId||'')).all();return json({objects:rows.results});
    }
    if(parts[0]==='api'&&parts[1]==='recovery'&&parts[2]==='signatures'&&parts[4]==='restore'&&request.method==='POST'){
        const ws=await membership(env.DB,user.id,request.headers.get('x-workspace-id'));requireRole(ws.role,'owner');const body=await jsonBody(request,8192);if(body.confirm!==true)throw new HttpError(400,'Confirm restoration.');
        const row=await env.DB.prepare("SELECT workspace_id,report_id,id,executed_key AS object_key,executed_backup_key AS backup_key,executed_sha256 AS sha256,executed_bytes AS bytes,'application/pdf' AS mime_type FROM signature_requests WHERE workspace_id=? AND id=? AND status='completed'").bind(ws.id,safeId(parts[3])).first();if(!row)throw new HttpError(404,'Executed report not found.');await restoreVerified(env,row);await auditStatement(env.DB,ws.id,user.id,'executed_pdf.restored',row.id).run();return json({restored:true,sha256:row.sha256});
    }
    if (parts[0] !== 'api' || parts[1] !== 'recovery' || parts[2] !== 'objects' || parts[4] !== 'restore' || parts.length !== 5 || request.method !== 'POST')
        return null;
    const ws = await membership(env.DB, user.id, request.headers.get('x-workspace-id'));
    requireRole(ws.role, 'owner');
    const body = await jsonBody(request, 8192);
    if (body.confirm !== true)
        throw new HttpError(400, 'Confirm restoration of the exact recorded file.');
    const row = await env.DB.prepare('SELECT * FROM objects WHERE workspace_id=? AND id=?').bind(ws.id, safeId(parts[3])).first();
    if (!row)
        throw new HttpError(404, 'Active object manifest not found.');
    await restoreVerified(env, row);
    await auditStatement(env.DB, ws.id, user.id, 'object.restored', row.id, { sha256: row.sha256 }).run();
    return json({ restored: true, sha256: row.sha256 });
}
export async function scheduledMaintenance(env) {
    await drainCleanup(env);
    const now = nowSeconds();
    await env.DB.batch([
        env.DB.prepare('DELETE FROM login_challenges WHERE expires_at<=?').bind(now),
        env.DB.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(now),
        env.DB.prepare('DELETE FROM rate_limits WHERE window_start<?').bind(now - 86400),
        env.DB.prepare('DELETE FROM billing_locks WHERE expires_at<=?').bind(now)
    ]);
}

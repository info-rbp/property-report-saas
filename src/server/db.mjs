import { HttpError, nowSeconds } from './security.mjs';
export function auditStatement(db, workspaceId, actorId, action, resourceId, details = {}) {
    return db.prepare('INSERT INTO audit_events(id,workspace_id,actor_id,action,resource_id,details_json,created_at) VALUES(?,?,?,?,?,?,?)')
        .bind(crypto.randomUUID(), workspaceId, actorId, action, resourceId || null, JSON.stringify(details), nowSeconds());
}
export async function membership(db, userId, workspaceId) {
    if (!workspaceId)
        throw new HttpError(400, 'Select a workspace.', 'workspace_required');
    const row = await db.prepare(`SELECT m.role,w.* FROM members m JOIN workspaces w ON w.id=m.workspace_id
    WHERE m.user_id=? AND m.workspace_id=? AND w.archived_at IS NULL`).bind(userId, workspaceId).first();
    if (!row)
        throw new HttpError(404, 'Workspace not found.');
    return row;
}
export const monthStart = () => { const d = new Date(); return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000); };
export function branding(input) {
    const out = {};
    for (const key of ['companyName', 'companyAddress', 'companyPhone', 'companyEmail', 'companyWebsite']) {
        const value = input?.[key];
        if (value !== undefined && (typeof value !== 'string' || value.length > 500 || /[\u0000-\u001f]/.test(value)))
            throw new HttpError(400, 'Invalid branding field.');
        out[key] = (value || '').trim();
    }
    if (!out.companyName)
        throw new HttpError(400, 'A company name is required.');
    if (out.companyWebsite && !/^https:\/\//.test(out.companyWebsite))
        throw new HttpError(400, 'Company website must use HTTPS.');
    // Remote logos/HTML are intentionally not accepted: they introduce cross-tenant fetch and injection risks.
    return out;
}

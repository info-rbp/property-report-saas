import { HttpError, json, jsonBody, text, emailAddress, randomToken, sha256, nowSeconds, safeId } from './security.mjs';
import { auditStatement, membership, branding } from './db.mjs';
import { requireRole, requireWritePlan, entitlement, readiness } from './plans.mjs';
import { sendEmail } from './auth.mjs';
const workspaceView = row => ({ id: row.id, name: row.name, role: row.role, trialEndsAt: row.trial_ends_at, branding: JSON.parse(row.branding_json || '{}') });
export async function workspaceRoutes(request, env, user, mailer = sendEmail) {
    const url = new URL(request.url), parts = url.pathname.split('/').filter(Boolean), method = request.method;
    if (url.pathname === '/api/me' && method === 'GET') {
        const list = await env.DB.prepare(`SELECT w.*,m.role FROM members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=? AND w.archived_at IS NULL ORDER BY w.name`).bind(user.id).all();
        return json({ user: { id: user.id, email: user.email, expiresAt: user.expires_at }, workspaces: list.results.map(workspaceView), termsVersion: env.TERMS_VERSION, privacyVersion: env.PRIVACY_VERSION });
    }
    if (url.pathname === '/api/workspaces' && method === 'POST') {
        if (env.PUBLIC_SIGNUP_ENABLED !== 'true')
            throw new HttpError(503, 'Workspace registration is not open.');
        if (!env.TERMS_VERSION || env.TERMS_VERSION === 'unapproved' || !env.PRIVACY_VERSION || env.PRIVACY_VERSION === 'unapproved')
            throw new HttpError(503, 'Approved terms and privacy documents are required before onboarding.');
        const body = await jsonBody(request, 8192), name = text(body.name, 120, true);
        if (body.accepted !== true || body.termsVersion !== env.TERMS_VERSION || body.privacyVersion !== env.PRIVACY_VERSION)
            throw new HttpError(400, 'Accept the current terms and privacy notice.', 'consent_required');
        const id = crypto.randomUUID(), now = nowSeconds();
        const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM members WHERE user_id=? AND role='owner'").bind(user.id).first();
        if (count.n >= 10)
            throw new HttpError(409, 'Workspace creation limit reached.');
        await env.DB.batch([
            env.DB.prepare(`INSERT INTO workspaces(id,name,created_at,trial_ends_at,branding_json,terms_version,privacy_version)
        SELECT ?,?,?,CASE WHEN trial_used=0 THEN ? ELSE ? END,?,?,? FROM users WHERE id=?`).bind(id, name, now, now + 14 * 86400, now, JSON.stringify({ companyName: name }), env.TERMS_VERSION, env.PRIVACY_VERSION, user.id),
            env.DB.prepare("INSERT INTO members(workspace_id,user_id,role,created_at) VALUES(?,?,'owner',?)").bind(id, user.id, now),
            env.DB.prepare('UPDATE users SET trial_used=1 WHERE id=?').bind(user.id),
            auditStatement(env.DB, id, user.id, 'workspace.created', id, { terms: env.TERMS_VERSION, privacy: env.PRIVACY_VERSION })
        ]);
        const ws = await membership(env.DB, user.id, id);
        return json(workspaceView(ws), 201);
    }
    if (url.pathname === '/api/invitations/accept' && method === 'POST') {
        const body = await jsonBody(request, 8192);
        if (!/^[a-f0-9]{64}$/.test(body.token || ''))
            throw new HttpError(400, 'Invalid invitation.');
        const now = nowSeconds(), invitation = await env.DB.prepare('SELECT * FROM invitations WHERE token_hash=? AND email=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>?').bind(await sha256(body.token), user.email, now).first();
        if (!invitation)
            throw new HttpError(404, 'Invitation not found or not addressed to this account.');
        const access = await requireWritePlan(env.DB, invitation.workspace_id);
        const existing = await env.DB.prepare('SELECT role FROM members WHERE workspace_id=? AND user_id=?').bind(invitation.workspace_id, user.id).first();
        if (existing)
            throw new HttpError(409, 'You already belong to this workspace. An invitation cannot change your role.');
        const rows = await env.DB.batch([
            env.DB.prepare(`INSERT INTO members(workspace_id,user_id,role,created_at)
        SELECT workspace_id,?,role,? FROM invitations WHERE id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>?
        AND (SELECT COUNT(*) FROM members WHERE workspace_id=invitations.workspace_id)<?`).bind(user.id, now, invitation.id, now, access.limits.seats),
            env.DB.prepare(`UPDATE invitations SET accepted_at=? WHERE id=? AND EXISTS(SELECT 1 FROM members WHERE workspace_id=? AND user_id=?)`).bind(now, invitation.id, invitation.workspace_id, user.id)
        ]);
        if (rows[0].meta.changes !== 1)
            throw new HttpError(409, 'The invitation is no longer available or the workspace has reached its seat limit.', 'seat_limit');
        await auditStatement(env.DB, invitation.workspace_id, user.id, 'invitation.accepted', invitation.id).run();
        return json({ workspaceId: invitation.workspace_id });
    }
    if (parts[0] !== 'api' || parts[1] !== 'workspaces' || !parts[2])
        return null;
    const id = safeId(parts[2]);if(request.headers.get('x-workspace-id')&&request.headers.get('x-workspace-id')!==id)throw new HttpError(400,'Workspace scope mismatch.');const ws = await membership(env.DB, user.id, id);
    if (parts.length === 3 && method === 'GET')
        return json({ ...workspaceView(ws), entitlement: await entitlement(env.DB, id) });
    if (parts[3] === 'branding' && method === 'PUT') {
        requireRole(ws.role, 'admin');
        const brand = branding(await jsonBody(request, 8192));
        const oldBrand=JSON.parse(ws.branding_json||'{}');if(oldBrand.companyLogoAssetId)brand.companyLogoAssetId=oldBrand.companyLogoAssetId;
        await env.DB.batch([env.DB.prepare('UPDATE workspaces SET branding_json=? WHERE id=?').bind(JSON.stringify(brand), id), auditStatement(env.DB, id, user.id, 'branding.updated', id)]);
        return json(brand);
    }
    if (parts[3] === 'readiness' && method === 'GET') {
        requireRole(ws.role, 'owner');
        return json(await readiness(env));
    }
    if (parts[3] === 'members' && parts.length === 4 && method === 'GET') {
        requireRole(ws.role, 'admin');
        const rows = await env.DB.prepare('SELECT m.user_id AS id,u.email,m.role,m.created_at FROM members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? ORDER BY u.email').bind(id).all();
        return json(rows.results);
    }
    if (parts[3] === 'members' && parts.length === 5 && ['PATCH', 'DELETE'].includes(method)) {
        requireRole(ws.role, 'admin');
        const targetId = safeId(parts[4]);
        const target = await env.DB.prepare('SELECT role FROM members WHERE workspace_id=? AND user_id=?').bind(id, targetId).first();
        if (!target)
            throw new HttpError(404, 'Member not found.');
        if (ws.role !== 'owner' && ['owner', 'admin'].includes(target.role))
            throw new HttpError(403, 'Only an owner can change an administrator or owner.');
        if (method === 'DELETE') {
            await env.DB.batch([env.DB.prepare('DELETE FROM members WHERE workspace_id=? AND user_id=?').bind(id, targetId), auditStatement(env.DB, id, user.id, 'member.removed', targetId)]);
        }
        else {
            const body = await jsonBody(request, 8192), role = body.role;
            if (!['admin', 'editor', 'viewer'].includes(role) || (role === 'admin' && ws.role !== 'owner'))
                throw new HttpError(403, 'That role change is not permitted.');
            await env.DB.batch([env.DB.prepare('UPDATE members SET role=? WHERE workspace_id=? AND user_id=?').bind(role, id, targetId), auditStatement(env.DB, id, user.id, 'member.role_changed', targetId, { role })]);
        }
        return json({ success: true });
    }
    if (parts[3] === 'transfer-ownership' && method === 'POST') {
        requireRole(ws.role, 'owner');
        const body = await jsonBody(request, 8192), target = safeId(body.userId);
        if (target === user.id)
            throw new HttpError(400, 'Select another existing member.');
        const member = await env.DB.prepare('SELECT user_id FROM members WHERE workspace_id=? AND user_id=?').bind(id, target).first();
        if (!member)
            throw new HttpError(404, 'Member not found.');
        await env.DB.batch([
            env.DB.prepare("UPDATE members SET role='owner' WHERE workspace_id=? AND user_id=?").bind(id, target),
            env.DB.prepare("UPDATE members SET role='admin' WHERE workspace_id=? AND user_id=?").bind(id, user.id),
            auditStatement(env.DB, id, user.id, 'ownership.transferred', target)
        ]);
        return json({ success: true });
    }
    if (parts[3] === 'invitations' && parts.length === 4 && method === 'GET') {
        requireRole(ws.role, 'admin');
        const rows = await env.DB.prepare('SELECT id,email,role,expires_at,accepted_at,revoked_at FROM invitations WHERE workspace_id=? ORDER BY expires_at DESC').bind(id).all();
        return json(rows.results);
    }
    if (parts[3] === 'invitations' && parts.length === 4 && method === 'POST') {
        requireRole(ws.role, 'admin');
        const body = await jsonBody(request, 8192), email = emailAddress(body.email), role = body.role;
        if (!['admin', 'editor', 'viewer'].includes(role) || (role === 'admin' && ws.role !== 'owner'))
            throw new HttpError(403, 'That invitation role is not permitted.');
        const access = await requireWritePlan(env.DB, id), now = nowSeconds();
        const members = await env.DB.prepare('SELECT COUNT(*) AS n FROM members WHERE workspace_id=?').bind(id).first();
        if (members.n >= access.limits.seats)
            throw new HttpError(409, 'The plan seat limit has been reached.', 'seat_limit');
        await env.DB.prepare('UPDATE invitations SET revoked_at=? WHERE workspace_id=? AND expires_at<=? AND accepted_at IS NULL AND revoked_at IS NULL').bind(now, id, now).run();
        const token = randomToken(), invitationId = crypto.randomUUID();
        await env.DB.prepare('INSERT INTO invitations(id,workspace_id,email,role,token_hash,expires_at,created_by) VALUES(?,?,?,?,?,?,?)').bind(invitationId, id, email, role, await sha256(token), now + 7 * 86400, user.id).run();
        try {
            await mailer(env, email, `Invitation to ${ws.name}`, `Sign in with this email address, then open:\n${env.APP_ORIGIN}/#invite=${token}\n\nInvitation expires in 7 days.`, `invite-${invitationId}`);
        }
        catch (e) {
            await env.DB.prepare('UPDATE invitations SET revoked_at=? WHERE id=? AND workspace_id=?').bind(now, invitationId, id).run();
            throw e;
        }
        await auditStatement(env.DB, id, user.id, 'invitation.created', invitationId, { role }).run();
        return json({ id: invitationId, email, role }, 201);
    }
    if (parts[3] === 'invitations' && parts.length === 5 && method === 'DELETE') {
        requireRole(ws.role, 'admin');
        const result = await env.DB.prepare('UPDATE invitations SET revoked_at=? WHERE workspace_id=? AND id=? AND accepted_at IS NULL').bind(nowSeconds(), id, safeId(parts[4])).run();
        if (!result.meta.changes)
            throw new HttpError(404, 'Invitation not found.');
        await auditStatement(env.DB, id, user.id, 'invitation.revoked', parts[4]).run();
        return json({ success: true });
    }
    if (parts[3] === 'audit' && method === 'GET') {
        requireRole(ws.role, 'admin');
        const before = Number(url.searchParams.get('before') || nowSeconds() + 1);
        const events = await env.DB.prepare('SELECT * FROM audit_events WHERE workspace_id=? AND created_at<? ORDER BY created_at DESC,id DESC LIMIT 100').bind(id, before).all();
        return json({ events: events.results });
    }
    if (parts[3] === 'export' && method === 'GET') {
        requireRole(ws.role, 'owner');
        // Identifiers are from a fixed allow-list, never copied into SQL from user input.
        const tables = { properties:'properties',reports:'reports',objects:'objects',templates:'templates',deliveries:'deliveries',signatures:'signature_requests',signers:'signature_parties',brandAssets:'workspace_assets',emailStatus:'email_outbox',audit:'audit_events' };
        const table = tables[url.searchParams.get('table') || 'properties'];
        if (!table)
            throw new HttpError(400, 'Unknown export table.');
        const after = url.searchParams.get('after') || '';
        const columns=table==='signature_parties'?'workspace_id,request_id,id,name,email,role_label,sequence,countersigner,status,signed_name,signature_image,signature_hash,commentary,fields_json,consent_text,signed_at,created_at':table==='email_outbox'?'id,workspace_id,delivery_id,status,attempts,provider_id,created_at,accepted_at,delivered_at,last_error':table==='signature_requests'?'workspace_id,id,report_id,delivery_id,signing_order,status,issued_pdf_sha256,expires_at,created_at,completed_at,executed_key,executed_backup_key,executed_sha256,executed_bytes':'*';
        const rows = await env.DB.prepare(`SELECT ${columns} FROM ${table} WHERE workspace_id=? AND id>? ORDER BY id LIMIT 200`).bind(id, after).all();
        await auditStatement(env.DB, id, user.id, 'data.exported', id, { table }).run();
        return json({ workspaceId: id, table, rows: rows.results, next: rows.results.length === 200 ? rows.results.at(-1).id : null });
    }
    return null;
}

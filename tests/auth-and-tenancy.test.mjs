import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, setup } from './helpers.mjs';
import { nowSeconds, sha256 } from '../src/server/security.mjs';
test('sign-in binds single-use links to the requesting browser and stores only token digests', async (t) => {
    const f = fixture(t), challenge = await f.beginLogin('owner@example.test');
    let r = await f.request('/api/auth/verify', { method: 'POST', body: { token: challenge.token }, cookie: '__Host-pr_flow=wrong' });
    assert.equal(r.status, 400);
    const stored = await f.db.prepare('SELECT * FROM login_challenges').first();
    assert.equal(stored.token_hash, await sha256(challenge.token));
    assert.notEqual(stored.flow_hash, challenge.flowCookie.split('=')[1]);
    r = await f.request('/api/auth/verify', { method: 'POST', body: { token: challenge.token }, cookie: challenge.flowCookie });
    assert.equal(r.status, 200);
    assert.match(r.headers.getSetCookie()[0], /HttpOnly; SameSite=Lax/);
    assert.match(r.headers.getSetCookie()[0], /Secure/);
    r = await f.request('/api/auth/verify', { method: 'POST', body: { token: challenge.token }, cookie: challenge.flowCookie });
    assert.equal(r.status, 400);
});
test('expired sign-in links cannot create a session', async (t) => {
    const f = fixture(t), c = await f.beginLogin('owner@example.test');
    await f.db.prepare('UPDATE login_challenges SET expires_at=?').bind(nowSeconds() - 1).run();
    assert.equal((await f.request('/api/auth/verify', { method: 'POST', body: { token: c.token }, cookie: c.flowCookie })).status, 400);
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM sessions').first()).n, 0);
});
test('logout revokes the server-side session and forged identity headers do not authenticate', async (t) => {
    const f = fixture(t), u = await f.login('owner@example.test');
    assert.equal((await f.request('/api/me', { headers: { 'X-User-Id': u.id, 'Cf-Access-Authenticated-User-Email': u.email } })).status, 401);
    assert.equal((await f.request('/api/auth/logout', { method: 'POST', cookie: u.cookie })).status, 200);
    assert.equal((await f.request('/api/me', { cookie: u.cookie })).status, 401);
});
test('browser writes require the exact application origin', async (t) => {
    const f = fixture(t);
    assert.equal((await f.request('/api/auth/start', { method: 'POST', body: { email: 'owner@example.test' }, origin: false })).status, 403);
    assert.equal((await f.request('/api/auth/start', { method: 'POST', body: { email: 'owner@example.test' }, origin: false, headers: { Origin: 'https://other.test' } })).status, 403);
});
test('sign-in rate limiting rejects the sixth request to the same email', async (t) => {
    const f = fixture(t);
    for (let i = 0; i < 5; i++)
        assert.equal((await f.request('/api/auth/start', { method: 'POST', body: { email: 'owner@example.test' } })).status, 202);
    assert.equal((await f.request('/api/auth/start', { method: 'POST', body: { email: 'owner@example.test' } })).status, 429);
});
test('workspace creation requires current consent and one account cannot repeatedly create free trials', async (t) => {
    const f = fixture(t), u = await f.login('owner@example.test');
    assert.equal((await f.request('/api/workspaces', { method: 'POST', cookie: u.cookie, body: { name: 'Agency', accepted: true, termsVersion: 'old', privacyVersion: 'fixture-privacy-v1' } })).status, 400);
    const a = await f.workspace(u, 'A'), b = await f.workspace(u, 'B');
    assert.ok(a.trialEndsAt > nowSeconds() + 86400);
    assert.ok(b.trialEndsAt <= nowSeconds());
});
test('guessing a property or report ID cannot cross workspace boundaries', async (t) => {
    const f = await setup(t), report = await f.report(f.user, f.ws, f.prop), other = await f.login('other@example.test'), otherWs = await f.workspace(other, 'Other');
    for (const path of [`/api/properties/${f.prop.id}`, `/api/reports/${report.id}`]) {
        assert.equal((await f.request(path, { cookie: other.cookie, workspace: otherWs.id })).status, 404);
        assert.equal((await f.request(path, { cookie: other.cookie, workspace: f.ws.id })).status, 404);
    }
    assert.equal((await f.request(`/api/properties?workspace=${otherWs.id}`, { cookie: f.user.cookie, workspace: f.ws.id })).status, 400);
    const list = await f.request('/api/properties', { cookie: other.cookie, workspace: otherWs.id });
    assert.deepEqual(list.data.properties, []);
});
test('viewer is read-only and membership revocation applies to existing sessions immediately', async (t) => {
    const f = await setup(t), viewer = await f.login('viewer@example.test');
    await f.member(viewer, f.ws, 'viewer');
    assert.equal((await f.request('/api/properties', { cookie: viewer.cookie, workspace: f.ws.id })).status, 200);
    assert.equal((await f.request('/api/properties', { method: 'POST', cookie: viewer.cookie, workspace: f.ws.id, body: { address: 'Unauthorized' } })).status, 403);
    assert.equal((await f.request(`/api/workspaces/${f.ws.id}/members/${viewer.id}`, { method: 'DELETE', cookie: f.user.cookie })).status, 200);
    assert.equal((await f.request('/api/properties', { cookie: viewer.cookie, workspace: f.ws.id })).status, 404);
});
test('administrators cannot promote themselves or demote the owner; last owner cannot be deleted', async (t) => {
    const f = await setup(t), admin = await f.login('admin@example.test');
    await f.member(admin, f.ws, 'admin');
    assert.equal((await f.request(`/api/workspaces/${f.ws.id}/members/${f.user.id}`, { method: 'DELETE', cookie: admin.cookie })).status, 403);
    assert.equal((await f.request(`/api/workspaces/${f.ws.id}/members/${admin.id}`, { method: 'PATCH', cookie: admin.cookie, body: { role: 'owner' } })).status, 403);
    assert.equal((await f.request(`/api/workspaces/${f.ws.id}/members/${f.user.id}`, { method: 'DELETE', cookie: f.user.cookie })).status, 409);
    assert.equal((await f.request(`/api/workspaces/${f.ws.id}/members/${f.user.id}`, { method: 'PATCH', cookie: f.user.cookie, body: { role: 'viewer' } })).status, 409);
});
test('ownership transfer is atomic and retains exactly one owner', async (t) => {
    const f = await setup(t), editor = await f.login('editor@example.test');
    await f.member(editor, f.ws, 'editor');
    const r = await f.request(`/api/workspaces/${f.ws.id}/transfer-ownership`, { method: 'POST', cookie: f.user.cookie, body: { userId: editor.id } });
    assert.equal(r.status, 200, r.content);
    const rows = (await f.db.prepare('SELECT * FROM members WHERE workspace_id=?').bind(f.ws.id).all()).results;
    assert.equal(rows.filter(r => r.role === 'owner').length, 1);
    assert.equal(rows.find(r => r.user_id === editor.id).role, 'owner');
});
test('invitation can only be accepted once by its intended authenticated email', async (t) => {
    const f = await setup(t);
    let r = await f.request(`/api/workspaces/${f.ws.id}/invitations`, { method: 'POST', cookie: f.user.cookie, body: { email: 'invited@example.test', role: 'editor' } });
    assert.equal(r.status, 201, r.content);
    const token = f.mail.at(-1).content.match(/#invite=([a-f0-9]+)/)[1], wrong = await f.login('wrong@example.test'), correct = await f.login('invited@example.test');
    assert.equal((await f.request('/api/invitations/accept', { method: 'POST', cookie: wrong.cookie, body: { token } })).status, 404);
    assert.equal((await f.request('/api/invitations/accept', { method: 'POST', cookie: correct.cookie, body: { token } })).status, 200);
    assert.equal((await f.request('/api/invitations/accept', { method: 'POST', cookie: correct.cookie, body: { token } })).status, 404);
});
test('an invitation cannot elevate the role of an existing member', async (t) => {
    const f = await setup(t), viewer = await f.login('viewer@example.test');
    await f.member(viewer, f.ws, 'viewer');
    await f.request(`/api/workspaces/${f.ws.id}/invitations`, { method: 'POST', cookie: f.user.cookie, body: { email: viewer.email, role: 'admin' } });
    const token = f.mail.at(-1).content.match(/#invite=([a-f0-9]+)/)[1];
    assert.equal((await f.request('/api/invitations/accept', { method: 'POST', cookie: viewer.cookie, body: { token } })).status, 409);
    assert.equal((await f.db.prepare('SELECT role FROM members WHERE workspace_id=? AND user_id=?').bind(f.ws.id, viewer.id).first()).role, 'viewer');
});
test('branding is server-owned, scoped to one workspace and rejects remote executable content fields', async (t) => {
    const f = await setup(t);
    let r = await f.request(`/api/workspaces/${f.ws.id}/branding`, { method: 'PUT', cookie: f.user.cookie, body: { companyName: 'New Agency', companyWebsite: 'https://agency.test', companyLogoUrl: 'https://attacker.test/logo', html: '<script>alert(1)</script>' } });
    assert.equal(r.status, 200);
    assert.equal(r.data.companyName, 'New Agency');
    assert.equal(r.data.companyLogoUrl, undefined);
    assert.equal(r.data.html, undefined);
    const report = await f.report(f.user, f.ws, f.prop);
    assert.equal(report.details.companyName, 'New Agency');
});
test('all authenticated responses and static assets receive security and no-store headers', async (t) => {
    const f = fixture(t);
    const r = await f.request('/');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

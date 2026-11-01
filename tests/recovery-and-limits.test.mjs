import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, fixture, JPEG } from './helpers.mjs';
import { drainCleanup } from '../src/server/recovery.mjs';
import { storeMirrored } from '../src/server/storage.mjs';
import { nowSeconds, limitedBytes } from '../src/server/security.mjs';
import { PLANS } from '../src/server/plans.mjs';
async function photo(f) { const report = await f.report(f.user, f.ws, f.prop); const r = await f.request(`/api/reports/${report.id}/photos?areaId=${report.areas[0].id}`, { method: 'POST', cookie: f.user.cookie, workspace: f.ws.id, raw: JPEG, headers: { 'Content-Type': 'image/jpeg', 'If-Match': '1' } }); assert.equal(r.status, 201, r.content); return r.data; }
test('owner can restore missing primary evidence from an independently verified recovery copy', async (t) => {
    const f = await setup(t), r = await photo(f), object = await f.db.prepare('SELECT * FROM objects').first();
    await f.env.FILES.delete(object.object_key);
    assert.equal((await f.request(r.photos[0].url, { cookie: f.user.cookie })).status, 503);
    const restored = await f.request(`/api/recovery/objects/${object.id}/restore`, { method: 'POST', cookie: f.user.cookie, workspace: f.ws.id, body: { confirm: true } });
    assert.equal(restored.status, 200, restored.content);
    assert.deepEqual((await f.request(r.photos[0].url, { cookie: f.user.cookie })).bytes, JPEG);
    assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action='object.restored'").first()).n, 1);
});
test('restore rejects altered backup bytes, non-owner roles and another tenant object ID', async (t) => {
    const f = await setup(t);
    await photo(f);
    const object = await f.db.prepare('SELECT * FROM objects').first(), editor = await f.login('editor@example.test');
    await f.member(editor, f.ws, 'editor');
    assert.equal((await f.request(`/api/recovery/objects/${object.id}/restore`, { method: 'POST', cookie: editor.cookie, workspace: f.ws.id, body: { confirm: true } })).status, 403);
    const other = await f.login('other@example.test'), otherWs = await f.workspace(other, 'Other');
    assert.equal((await f.request(`/api/recovery/objects/${object.id}/restore`, { method: 'POST', cookie: other.cookie, workspace: otherWs.id, body: { confirm: true } })).status, 404);
    f.env.BACKUPS.objects.get(object.backup_key).bytes[20] ^= 1;
    assert.equal((await f.request(`/api/recovery/objects/${object.id}/restore`, { method: 'POST', cookie: f.user.cookie, workspace: f.ws.id, body: { confirm: true } })).status, 503);
});
test('failed primary deletion remains queued and succeeds on retry without deleting the backup', async (t) => {
    const f = await setup(t), report = await photo(f), object = await f.db.prepare('SELECT * FROM objects').first();
    f.env.FILES.failDelete = true;
    const removed = await f.request(`/api/reports/${report.id}/photos/${object.id}`, { method: 'DELETE', cookie: f.user.cookie, workspace: f.ws.id, headers: { 'If-Match': String(report.revision) } });
    assert.equal(removed.status, 200, removed.content);
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM objects').first()).n, 0);
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM recovery_records').first()).n, 1);
    assert.equal((await f.db.prepare('SELECT completed_at FROM storage_cleanup').first()).completed_at, null);
    f.env.FILES.failDelete = false;
    assert.equal((await drainCleanup(f.env, f.ws.id)).completed, 1);
    assert.equal(f.env.FILES.objects.size, 0);
    assert.equal(f.env.BACKUPS.objects.size, 1);
});
test('draft deletion keeps recovery metadata and cleans the primary storage via durable outbox', async (t) => {
    const f = await setup(t), report = await photo(f);
    const result = await f.request(`/api/reports/${report.id}`, { method: 'DELETE', cookie: f.user.cookie, workspace: f.ws.id, headers: { 'If-Match': String(report.revision) } });
    assert.equal(result.status, 200, result.content);
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM reports').first()).n, 0);
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM recovery_records').first()).n, 1);
    assert.equal(f.env.FILES.objects.size, 0);
    assert.equal(f.env.BACKUPS.objects.size, 1);
});
test('retention holds stop deletions and outbox processing', async (t) => {
    const f = await setup(t), report = await photo(f);
    await f.db.prepare('UPDATE workspaces SET legal_hold=1 WHERE id=?').bind(f.ws.id).run();
    assert.equal((await f.request(`/api/reports/${report.id}`, { method: 'DELETE', cookie: f.user.cookie, workspace: f.ws.id, headers: { 'If-Match': String(report.revision) } })).status, 409);
    assert.equal((await drainCleanup(f.env, f.ws.id)).completed, 0);
    assert.equal(f.env.FILES.objects.size, 1);
});
test('failed mirror waits for any slow primary write before cleanup', async (t) => {
    const f = fixture(t), originalPut = f.env.FILES.put.bind(f.env.FILES);
    f.env.FILES.put = async (...args) => { await new Promise(r => setTimeout(r, 10)); return originalPut(...args); };
    f.env.BACKUPS.failPut = true;
    await assert.rejects(storeMirrored(f.env, 'workspace', 'report', 'photo', JPEG, 'image/jpeg'), /safely stored/);
    assert.equal(f.env.FILES.objects.size, 0);
});
test('request size limit applies even when Content-Length is absent', async () => {
    const request = new Request('https://saas.test', { method: 'POST', body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(11)); c.close(); } }), duplex: 'half' });
    await assert.rejects(limitedBytes(request, 10), e => e.status === 413);
});
test('scheduled maintenance removes expired authentication data but preserves reports and recovery copies', async (t) => {
    const f = await setup(t);
    await photo(f);
    await f.db.prepare('UPDATE sessions SET expires_at=0').run();
    await f.app.scheduled({}, f.env);
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM sessions').first()).n, 0);
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM reports').first()).n, 1);
    assert.equal(f.env.BACKUPS.objects.size, 1);
});
test('report creation enforces the trial monthly quota atomically', async (t) => {
    const f = await setup(t);
    for (let i = 0; i < 25; i++)
        await f.report(f.user, f.ws, f.prop);
    const r = await f.request(`/api/properties/${f.prop.id}/reports`, { method: 'POST', cookie: f.user.cookie, workspace: f.ws.id, body: { reportType: 'Routine' } });
    assert.equal(r.status, 409);
    assert.equal(r.data.code, 'report_limit');
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM reports').first()).n, 25);
});
test('invitation acceptance enforces the current paid seat limit rather than the invitation-time limit', async (t) => {
    const f = await setup(t);
    await f.request(`/api/workspaces/${f.ws.id}/invitations`, { method: 'POST', cookie: f.user.cookie, body: { email: 'invited@example.test', role: 'editor' } });
    const token = f.mail.at(-1).content.match(/#invite=([a-f0-9]+)/)[1];
    await f.db.prepare("INSERT INTO subscriptions(workspace_id,subscription_id,status,price_id,plan,access_until,updated_at) VALUES(?,?,'active','price_solo','solo',?,?)").bind(f.ws.id, 'sub_seat_limit', nowSeconds() + 86400, nowSeconds()).run();
    const invited = await f.login('invited@example.test');
    const result = await f.request('/api/invitations/accept', { method: 'POST', cookie: invited.cookie, body: { token } });
    assert.equal(result.status, 409);
    assert.equal(result.data.code, 'seat_limit');
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM members WHERE workspace_id=?').bind(f.ws.id).first()).n, PLANS.solo.seats);
});

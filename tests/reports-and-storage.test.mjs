import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, JPEG, fixture } from './helpers.mjs';
import { nowSeconds } from '../src/server/security.mjs';
import { form1Issues, FORM1_COLUMNS, mergeAdditionalAreas } from '../src/shared/form1.mjs';
import { jpegDimensions, assertObjectScope } from '../src/server/storage.mjs';
import { readiness, RELEASE_CHECKS } from '../src/server/plans.mjs';
import { IMPLEMENTATION_GAPS } from '../src/shared/implementation-status.mjs';
async function save(f, report, expected = report.revision) { return f.request(`/api/reports/${report.id}`, { method: 'PUT', cookie: f.user.cookie, workspace: f.ws.id, body: { report, expectedRevision: expected } }); }
async function upload(f, report, bytes = JPEG) { return f.request(`/api/reports/${report.id}/photos?areaId=${report.areas[0].id}`, { method: 'POST', cookie: f.user.cookie, workspace: f.ws.id, raw: bytes, headers: { 'Content-Type': 'image/jpeg', 'If-Match': String(report.revision) } }); }
test('stale report revisions are rejected without overwriting newer cloud data', async (t) => {
    const f = await setup(t), a = await f.report(f.user, f.ws, f.prop), b = structuredClone(a);
    a.details.additionalComments = 'Version two';
    let r = await save(f, a);
    assert.equal(r.status, 200, r.content);
    assert.equal(r.data.revision, 2);
    b.details.additionalComments = 'Stale overwrite';
    r = await save(f, b);
    assert.equal(r.status, 409);
    assert.equal(r.data.code, 'revision_conflict');
    r = await f.request(`/api/reports/${a.id}`, { cookie: f.user.cookie, workspace: f.ws.id });
    assert.equal(r.data.details.additionalComments, 'Version two');
});
test('missing revisions, malformed dates and duplicate area IDs are rejected', async (t) => {
    const f = await setup(t), a = await f.report(f.user, f.ws, f.prop);
    assert.equal((await f.request(`/api/reports/${a.id}`, { method: 'PUT', cookie: f.user.cookie, workspace: f.ws.id, body: { report: a } })).status, 428);
    a.details.inspectionDate = '2026-02-31';
    assert.equal((await save(f, a)).status, 400);
    a.details.inspectionDate = '2026-11-01';
    a.areas.push(structuredClone(a.areas[0]));
    assert.equal((await save(f, a)).status, 400);
});
test('Entry drafts contain protected versioned Form 1 candidate items and rating columns', async (t) => {
    const f = await setup(t), report = await f.report(f.user, f.ws, f.prop, 'Entry');
    assert.equal(report.areas.length, 9);
    assert.deepEqual(form1Issues(report), []);
    assert.equal(FORM1_COLUMNS.length, 5);
    const cases = [r => r.areas.shift(), r => r.areas[0].items.shift(), r => r.areas[0].items[0].name = 'Altered', r => delete r.areas[0].items[0].tenantAgrees, r => r.details.waFormVersion = 'wrong', r => r.details.formNumber = 'Not Form 1'];
    for (const mutate of cases) {
        const candidate = structuredClone(report);
        mutate(candidate);
        const r = await save(f, candidate);
        assert.equal(r.status, 400, r.content);
        assert.equal(r.data.code, 'form1_content_protected');
    }
});
test('additional report sections are permitted but cannot replace prescribed keys', async (t) => {
    const f = await setup(t), report = await f.report(f.user, f.ws, f.prop, 'Entry');
    const extra = { id: 'extra-area', name: 'Additional inspection', statutorySection: 99, items: [{ id: 'extra-item', name: 'Extra', statutoryKey: 'wa-form1:1:1', agentComments: 'Observation' }] };
    const merged = mergeAdditionalAreas(report, [extra]);
    assert.equal(merged.areas.at(-1).statutorySection, undefined);
    assert.equal(merged.areas.at(-1).items[0].statutoryKey, undefined);
    assert.equal((await save(f, merged)).status, 200);
});
test('photos are mirrored and hashed, and cannot be fetched by another tenant', async (t) => {
    const f = await setup(t), report = await f.report(f.user, f.ws, f.prop);
    const r = await upload(f, report);
    assert.equal(r.status, 201, r.content);
    assert.equal(r.data.revision, 2);
    assert.equal(r.data.photos.length, 1);
    assert.equal(f.env.FILES.objects.size, 1);
    assert.equal(f.env.BACKUPS.objects.size, 1);
    const object = await f.db.prepare('SELECT * FROM objects').first();
    assert.match(object.object_key, new RegExp(`^workspaces/${f.ws.id}/reports/${report.id}/`));
    assert.equal(object.sha256.length, 64);
    const image = await f.request(r.data.photos[0].url, { cookie: f.user.cookie });
    assert.equal(image.status, 200);
    assert.deepEqual(image.bytes, JPEG);
    const other = await f.login('other@example.test');
    assert.equal((await f.request(r.data.photos[0].url, { cookie: other.cookie })).status, 404);
});
test('a failed backup upload does not publish a photo manifest or advance report revision', async (t) => {
    const f = await setup(t), report = await f.report(f.user, f.ws, f.prop);
    f.env.BACKUPS.failPut = true;
    const r = await upload(f, report);
    assert.equal(r.status, 503, r.content);
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM objects').first()).n, 0);
    assert.equal((await f.db.prepare('SELECT revision FROM reports').first()).revision, 1);
    assert.equal(f.env.FILES.objects.size, 0);
});
test('stale photo uploads clean up uncommitted storage copies', async (t) => {
    const f = await setup(t), report = await f.report(f.user, f.ws, f.prop);
    assert.equal((await save(f, report)).status, 200);
    assert.equal((await upload(f, report)).status, 409);
    assert.equal(f.env.FILES.objects.size, 0);
    assert.equal(f.env.BACKUPS.objects.size, 0);
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM objects').first()).n, 0);
});
test('tampered primary photo bytes fail the integrity check', async (t) => {
    const f = await setup(t), report = await f.report(f.user, f.ws, f.prop), uploaded = await upload(f, report), key = Array.from(f.env.FILES.objects.keys())[0];
    f.env.FILES.objects.get(key).bytes[30] ^= 1;
    const r = await f.request(uploaded.data.photos[0].url, { cookie: f.user.cookie });
    assert.equal(r.status, 503);
    assert.match(r.data.error, /integrity/);
});
test('client data cannot inject photo storage keys, a foreign brand, or platform publication context', async (t) => {
    const f = await setup(t), report = await f.report(f.user, f.ws, f.prop);
    report.photos = [{ id: 'forged', storageKey: 'other/secret' }];
    report.details.companyName = 'Forged';
    report.details.companyLogoUrl = 'https://attacker.test/x';
    report.integrationContext = { propertyId: 'foreign' };
    report.completedPdfKey = 'foreign.pdf';
    const r = await save(f, report);
    assert.equal(r.status, 200);
    assert.deepEqual(r.data.photos, []);
    assert.equal(r.data.details.companyName, 'Example Agency');
    assert.equal(r.data.details.companyLogoUrl, undefined);
    assert.equal(r.data.integrationContext, undefined);
    assert.equal(r.data.completedPdfKey, undefined);
});
test('deleting an area with linked evidence is rejected', async (t) => {
    const f = await setup(t), report = await f.report(f.user, f.ws, f.prop), uploaded = await upload(f, report), changed = uploaded.data;
    changed.areas.shift();
    const r = await save(f, changed);
    assert.equal(r.status, 409);
    assert.match(r.data.error, /linked photos/);
});
test('completed report data is immutable even through direct SQL updates or deletion', async (t) => {
    const f = await setup(t), report = await f.report(f.user, f.ws, f.prop);
    await f.db.prepare("UPDATE reports SET status='completed' WHERE id=?").bind(report.id).run();
    assert.equal((await save(f, report)).status, 409);
    await assert.rejects(f.db.prepare('DELETE FROM reports WHERE id=?').bind(report.id).run(), /completed_report_immutable/);
    await assert.rejects(f.db.prepare('UPDATE reports SET report_data=? WHERE id=?').bind('{}', report.id).run(), /completed_report_immutable/);
});
test('correction creates a linked draft and does not modify the completed original', async (t) => {
    const f = await setup(t), report = await f.report(f.user, f.ws, f.prop);
    await f.db.prepare("UPDATE reports SET status='completed' WHERE id=?").bind(report.id).run();
    const r = await f.request(`/api/reports/${report.id}/corrections`, { method: 'POST', cookie: f.user.cookie, workspace: f.ws.id, body: { reason: 'Correct a factual observation' } });
    assert.equal(r.status, 201, r.content);
    assert.equal(r.data.report.status, 'draft');
    assert.equal(r.data.report.parentReportId, report.id);
    assert.notEqual(r.data.report.id, report.id);
    assert.equal((await f.db.prepare('SELECT status FROM reports WHERE id=?').bind(report.id).first()).status, 'completed');
});
test('expired trials block new reports while retaining read and export access', async (t) => {
    const f = await setup(t), report = await f.report(f.user, f.ws, f.prop);
    await f.db.prepare('UPDATE workspaces SET trial_ends_at=? WHERE id=?').bind(nowSeconds() - 1, f.ws.id).run();
    assert.equal((await save(f, report)).status, 402);
    assert.equal((await f.request(`/api/reports/${report.id}`, { cookie: f.user.cookie, workspace: f.ws.id })).status, 200);
    const exported = await f.request(`/api/workspaces/${f.ws.id}/export?table=reports`, { cookie: f.user.cookie });
    assert.equal(exported.status, 200);
    assert.equal(exported.data.rows.length, 1);
    assert.equal(exported.data.rows[0].workspace_id, f.ws.id);
});
test('report issuing and payment launch remain blocked despite configuration flags or evidence assertions', async (t) => {
    const f = await setup(t), report = await f.report(f.user, f.ws, f.prop);
    Object.assign(f.env, { LAUNCH_APPROVED: 'true', STRIPE_MODE: 'live', REPORT_RENDERER: {}, RESEND_API_KEY: 'fixture-email-secret', EMAIL_FROM: 'reports@example.test' });
    for (const key of RELEASE_CHECKS)
        await f.db.prepare('INSERT INTO release_evidence(key,release_id,approved_by,evidence_uri,evidence_sha256,approved_at,expires_at) VALUES(?,?,?,?,?,?,?)').bind(key, f.env.RELEASE_ID, 'Fixture reviewer', 'https://evidence.example.test/test', 'a'.repeat(64), nowSeconds(), nowSeconds() + 86400).run();
    const state = await readiness(f.env);
    assert.equal(state.ready, false);
    for (const gap of IMPLEMENTATION_GAPS)
        assert.ok(state.blockers.includes(gap));
    const r = await f.request(`/api/reports/${report.id}/complete`, { method: 'POST', cookie: f.user.cookie, workspace: f.ws.id, body: { confirm: true, expectedRevision: 1 } });
    assert.equal(r.status, 503);
    assert.equal(r.data.code, 'renderer_acceptance_required');
});
test('browser-supplied final PDFs are not trusted or stored', async (t) => {
    const f = await setup(t), report = await f.report(f.user, f.ws, f.prop);
    const r = await f.request(`/api/reports/${report.id}/complete`, { method: 'POST', cookie: f.user.cookie, workspace: f.ws.id, raw: '%PDF-1.7 forged', headers: { 'Content-Type': 'application/pdf', 'If-Match': '1' } });
    assert.equal(r.status, 415);
    assert.equal(f.env.FILES.objects.size, 0);
});
test('file parser and storage path checks reject invalid inputs', () => {
    assert.equal(jpegDimensions(JPEG).width, 1);
    assert.throws(() => jpegDimensions(new TextEncoder().encode('<svg/>')), /JPEG/);
    assert.throws(() => assertObjectScope('workspaces/a/reports/b/../../secret', 'a', 'b'), /scope/);
    assert.throws(() => assertObjectScope('workspaces/other/reports/b/photo/1', 'a', 'b'), /scope/);
});
test('composite database foreign keys prevent linking a report to another customer property', async (t) => {
    const f = await setup(t), other = await f.login('other@example.test'), otherWs = await f.workspace(other, 'Other');
    await assert.rejects(f.db.prepare('INSERT INTO reports(workspace_id,id,property_id,report_type,report_data,created_at,updated_at,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(otherWs.id, 'foreign-report', f.prop.id, 'Routine', '{}', nowSeconds(), nowSeconds(), other.id).run(), /FOREIGN KEY/);
});

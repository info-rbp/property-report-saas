import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, fixture, subscribe, signWebhook } from './helpers.mjs';
import { nowSeconds, verifyStripeSignature } from '../src/server/security.mjs';
import { entitlement } from '../src/server/plans.mjs';
const event = (type, id, object, created = nowSeconds()) => ({ id: `evt_${id}`, created, type, data: { object } });
async function checkout(f, plan = 'professional', requestId = crypto.randomUUID(), extra = {}) { return f.request('/api/billing/checkout', { method: 'POST', cookie: f.user.cookie, workspace: f.ws.id, body: { plan, requestId, ...extra } }); }
test('checkout prices come from the server and a checkout success does not grant subscription access', async (t) => {
    const f = await setup(t), id = crypto.randomUUID();
    await f.db.prepare('UPDATE workspaces SET trial_ends_at=0 WHERE id=?').bind(f.ws.id).run();
    const r = await checkout(f, 'professional', id, { priceId: 'price_unapproved', amount: 1 });
    assert.equal(r.status, 200, r.content);
    assert.equal(f.stripe.state.lastCheckout.params.line_items[0].price, 'price_professional');
    assert.equal(f.stripe.state.lastCheckout.params.payment_method_types, undefined);
    assert.equal((await entitlement(f.db, f.ws.id)).canWrite, false);
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM subscriptions').first()).n, 0);
    assert.match(f.stripe.state.lastCheckout.params.integration_identifier, /[a-z]{8}$/);
});
test('checkout retries reuse one session and a concurrent different attempt is rejected', async (t) => {
    const f = await setup(t), id = crypto.randomUUID(), first = await checkout(f, 'professional', id), second = await checkout(f, 'professional', id);
    assert.equal(first.status, 200, first.content);
    assert.equal(second.status, 200, second.content);
    assert.equal(first.data.url, second.data.url);
    assert.equal(f.stripe.state.createCount, 1);
    assert.equal((await checkout(f)).status, 409);
});
test('existing subscriptions must be changed in the portal instead of creating duplicate subscriptions', async (t) => {
    const f = await setup(t);
    await subscribe(f, f.ws);
    const r = await checkout(f);
    assert.equal(r.status, 409);
    assert.equal(r.data.code, 'subscription_exists');
    assert.equal((await f.request('/api/billing/portal', { method: 'POST', cookie: f.user.cookie, workspace: f.ws.id, body: {} })).status, 200);
});
test('only workspace owners can start checkout and one customer cannot select another customer workspace', async (t) => {
    const f = await setup(t), admin = await f.login('admin@example.test');
    await f.member(admin, f.ws, 'admin');
    assert.equal((await f.request('/api/billing/checkout', { method: 'POST', cookie: admin.cookie, workspace: f.ws.id, body: { plan: 'solo', requestId: crypto.randomUUID() } })).status, 403);
    const other = await f.login('other@example.test');
    assert.equal((await f.request('/api/billing/checkout', { method: 'POST', cookie: other.cookie, workspace: f.ws.id, body: { plan: 'solo', requestId: crypto.randomUUID() } })).status, 404);
});
test('unexpected plan prices, unreviewed tax and inactive registrations block checkout', async (t) => {
    const f = await setup(t);
    f.stripe.state.prices.get('price_professional').unit_amount = 1;
    assert.equal((await checkout(f)).status, 503);
    f.stripe.state.prices.get('price_professional').unit_amount = 24900;
    f.env.STRIPE_TAX_MODE = 'unconfigured';
    assert.equal((await checkout(f)).status, 503);
    f.env.STRIPE_TAX_MODE = 'active-registration';
    f.env.STRIPE_TAX_REGISTRATION_ID = 'taxreg_fixture';
    f.stripe.api.tax.registrations.retrieve = async () => ({ status: 'scheduled' });
    assert.equal((await checkout(f)).status, 503);
    f.stripe.api.tax.registrations.retrieve = async () => ({ status: 'active' });
    const r = await checkout(f);
    assert.equal(r.status, 200, r.content);
    assert.equal(f.stripe.state.lastCheckout.params.automatic_tax.enabled, true);
});
test('live checkout cannot be enabled by a staging key switch or a launch flag', async (t) => {
    const f = await setup(t);
    f.env.STRIPE_MODE = 'live';
    f.env.STRIPE_SECRET_KEY = ['rk', 'live', 'fixture-not-real'].join('_');
    f.env.LAUNCH_APPROVED = 'true';
    assert.equal((await checkout(f)).status, 503);
    f.env.ENVIRONMENT = 'production';
    const r = await checkout(f);
    assert.equal(r.status, 503);
    assert.equal(r.data.code, 'release_blocked');
    assert.equal(f.stripe.state.createCount, 0);
});
test('webhook verification rejects altered raw bodies, bad signatures and stale timestamps', async () => {
    const raw = '{"id":"evt_fixture"}', secret = 'fixture-secret', signature = await signWebhook(raw, secret);
    await verifyStripeSignature(raw, signature, secret);
    await assert.rejects(verifyStripeSignature(raw + ' ', signature, secret), /signature/);
    await assert.rejects(verifyStripeSignature(raw, await signWebhook(raw, secret, nowSeconds() - 301), secret), /signature/);
    await assert.rejects(verifyStripeSignature(raw, signature + ',t=' + nowSeconds(), secret), /signature/);
});
test('webhook requires signature and rejects events from the wrong environment', async (t) => {
    const f = await setup(t);
    assert.equal((await f.request('/api/billing/webhook', { method: 'POST', origin: false, body: event('invoice.paid', 'bad', { id: 'in_bad' }) })).status, 400);
    const r = await f.sendEvent({ ...event('invoice.paid', 'mode', { id: 'in_bad' }), livemode: true });
    assert.equal(r.status, 400);
});
test('subscription webhooks reconcile current Stripe state and duplicate events have one effect', async (t) => {
    const f = await setup(t), sub = await subscribe(f, f.ws), evt = event('customer.subscription.updated', 'active', { id: sub.id });
    let r = await f.sendEvent(evt);
    assert.equal(r.status, 200, r.content);
    assert.equal((await entitlement(f.db, f.ws.id)).reason, 'active');
    r = await f.sendEvent(evt);
    assert.equal(r.status, 200);
    assert.equal(r.data.duplicate, true);
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM billing_events').first()).n, 1);
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM transaction_guards').first()).n, 0);
});
test('an old active event cannot restore access after a later cancellation', async (t) => {
    const f = await setup(t), sub = await subscribe(f, f.ws), old = event('customer.subscription.updated', 'old', { id: sub.id, status: 'active' }, nowSeconds() - 1000);
    sub.status = 'canceled';
    let r = await f.sendEvent(event('customer.subscription.deleted', 'canceled', { id: sub.id }));
    assert.equal(r.status, 200, r.content);
    assert.equal((await entitlement(f.db, f.ws.id)).canWrite, false);
    r = await f.sendEvent(old);
    assert.equal(r.status, 200, r.content);
    assert.equal((await entitlement(f.db, f.ws.id)).canWrite, false);
    assert.equal((await f.db.prepare('SELECT status FROM subscriptions').first()).status, 'canceled');
});
test('payment failures revoke paid writes without deleting existing records', async (t) => {
    const f = await setup(t), sub = await subscribe(f, f.ws);
    await f.sendEvent(event('customer.subscription.created', 'start', { id: sub.id }));
    sub.status = 'past_due';
    f.stripe.state.invoices.set('in_failed', { id: 'in_failed', customer: sub.customer });
    const r = await f.sendEvent(event('invoice.payment_failed', 'failed', { id: 'in_failed' }));
    assert.equal(r.status, 200, r.content);
    assert.equal((await entitlement(f.db, f.ws.id)).canWrite, false);
    assert.equal((await f.request('/api/properties', { cookie: f.user.cookie, workspace: f.ws.id })).status, 200);
});
test('billing ownership is resolved by Stripe customer ID, not untrusted metadata', async (t) => {
    const f = await setup(t), other = await f.login('other@example.test'), otherWs = await f.workspace(other, 'Other'), sub = await subscribe(f, f.ws);
    sub.metadata = { workspace_id: otherWs.id };
    const r = await f.sendEvent(event('customer.subscription.created', 'metadata', { id: sub.id, customer: 'forged', metadata: { workspace_id: otherWs.id } }));
    assert.equal(r.status, 200, r.content);
    assert.equal((await f.db.prepare('SELECT workspace_id FROM subscriptions').first()).workspace_id, f.ws.id);
    assert.equal(await f.db.prepare('SELECT * FROM subscriptions WHERE workspace_id=?').bind(otherWs.id).first(), null);
});
test('full refunds place writes on hold while partial refunds are recorded without an automatic hold', async (t) => {
    const f = await setup(t), sub = await subscribe(f, f.ws);
    f.stripe.state.charges.set('ch_refund', { id: 'ch_refund', customer: sub.customer, amount: 24900, amount_refunded: 1000, refunded: false });
    let r = await f.sendEvent(event('charge.refunded', 'partial', { id: 'ch_refund' }));
    assert.equal(r.status, 200, r.content);
    assert.equal((await entitlement(f.db, f.ws.id)).canWrite, true);
    Object.assign(f.stripe.state.charges.get('ch_refund'), { amount_refunded: 24900, refunded: true });
    r = await f.sendEvent(event('charge.refunded', 'full', { id: 'ch_refund' }));
    assert.equal(r.status, 200, r.content);
    assert.equal((await entitlement(f.db, f.ws.id)).reason, 'billing_review');
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM billing_risks').first()).n, 2);
});
test('disputes and fraud warnings are captured and hold paid writes', async (t) => {
    const f = await setup(t), sub = await subscribe(f, f.ws);
    f.stripe.state.charges.set('ch_risk', { id: 'ch_risk', customer: sub.customer });
    for (const [type, id] of [['charge.dispute.created', 'dispute'], ['radar.early_fraud_warning.created', 'fraud']]) {
        const r = await f.sendEvent(event(type, id, { id: `obj_${id}`, charge: 'ch_risk' }));
        assert.equal(r.status, 200, r.content);
    }
    assert.equal((await entitlement(f.db, f.ws.id)).reason, 'billing_review');
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM billing_risks').first()).n, 2);
});
test('a webhook losing its lease before atomic commit is rejected and remains retryable', async (t) => {
    const f = await setup(t), sub = await subscribe(f, f.ws);
    let calls = 0;
    f.stripe.api.charges.retrieve = async () => { calls++; if (calls === 2)
        await f.db.prepare('UPDATE billing_locks SET expires_at=0').run(); return { id: 'ch_slow', customer: sub.customer, amount: 24900, amount_refunded: 24900, refunded: true }; };
    const r = await f.sendEvent(event('charge.refunded', 'lease', { id: 'ch_slow' }));
    assert.equal(r.status, 503, r.content);
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM subscriptions').first()).n, 0);
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM billing_events').first()).n, 0);
    assert.equal((await f.db.prepare('SELECT billing_hold FROM workspaces WHERE id=?').bind(f.ws.id).first()).billing_hold, 0);
});
test('same webhook ID with different signed contents is rejected', async (t) => {
    const f = await setup(t), sub = await subscribe(f, f.ws), a = event('customer.subscription.created', 'identity', { id: sub.id });
    assert.equal((await f.sendEvent(a)).status, 200);
    assert.equal((await f.sendEvent({ ...a, created: a.created - 1 })).status, 400);
});
test('unsupported configured subscription prices cannot retain previously cached write access', async (t) => {
    const f = await setup(t), sub = await subscribe(f, f.ws);
    await f.sendEvent(event('customer.subscription.created', 'known', { id: sub.id }));
    sub.items.data[0].price.id = 'price_unknown';
    const r = await f.sendEvent(event('customer.subscription.updated', 'unknown', { id: sub.id }));
    assert.equal(r.status, 200, r.content);
    assert.equal((await entitlement(f.db, f.ws.id)).canWrite, false);
});

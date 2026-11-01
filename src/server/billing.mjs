import { HttpError, json, jsonBody, limitedBytes, verifyStripeSignature, sha256, nowSeconds, text } from './security.mjs';
import { membership, auditStatement } from './db.mjs';
import { PLANS, requireRole, readiness } from './plans.mjs';
const ref = value => typeof value === 'string' ? value : value?.id;
export const BILLING_EVENTS = Object.freeze([
    'checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed',
    'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.paused', 'customer.subscription.resumed',
    'invoice.paid', 'invoice.payment_failed', 'invoice.payment_action_required', 'invoice.finalization_failed',
    'charge.dispute.created', 'charge.refunded', 'radar.early_fraud_warning.created'
]);
export async function stripeClient(env) {
    const { default: Stripe } = await import('stripe');
    return new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: env.STRIPE_API_VERSION, maxNetworkRetries: 0, timeout: 10000, httpClient: Stripe.createFetchHttpClient() });
}
export function verifyMode(env) {
    if (!['test', 'live'].includes(env.STRIPE_MODE) || !new RegExp(`^[sr]k_${env.STRIPE_MODE}_`).test(env.STRIPE_SECRET_KEY || ''))
        throw new HttpError(503, 'Stripe credentials do not match the configured environment.');
    if (env.ENVIRONMENT !== 'production' && env.STRIPE_MODE === 'live')
        throw new HttpError(503, 'Live billing is not permitted in this environment.');
}
function planForPrice(env, priceId) {
    return Object.keys(PLANS).find(plan => env[PLANS[plan].priceEnv] === priceId);
}
async function customerFor(env, stripe, workspace, user) {
    let row = await env.DB.prepare('SELECT customer_id FROM billing_customers WHERE workspace_id=?').bind(workspace.id).first();
    if (row)
        return row.customer_id;
    const customer = await stripe.customers.create({ email: user.email, name: workspace.name }, { idempotencyKey: `pr-saas-customer-${workspace.id}` });
    await env.DB.prepare('INSERT INTO billing_customers(workspace_id,customer_id) VALUES(?,?) ON CONFLICT(workspace_id) DO NOTHING').bind(workspace.id, customer.id).run();
    row = await env.DB.prepare('SELECT customer_id FROM billing_customers WHERE workspace_id=?').bind(workspace.id).first();
    if (row.customer_id !== customer.id)
        throw new HttpError(409, 'Customer provisioning is in progress.');
    return row.customer_id;
}
async function assertTaxReady(env, stripe) {
    if (env.STRIPE_TAX_MODE === 'reviewed-not-required')
        return false;
    if (env.STRIPE_TAX_MODE !== 'active-registration' || !env.STRIPE_TAX_REGISTRATION_ID)
        throw new HttpError(503, 'Tax treatment has not been configured.');
    const [settings, registration] = await Promise.all([stripe.tax.settings.retrieve(), stripe.tax.registrations.retrieve(env.STRIPE_TAX_REGISTRATION_ID)]);
    if (settings.status !== 'active' || registration.status !== 'active')
        throw new HttpError(503, 'Stripe Tax settings and the approved registration must both be active.');
    return true;
}
export async function billingRoutes(request, env, user, makeStripe = stripeClient) {
    const path = new URL(request.url).pathname;
    if (!['/api/billing/checkout', '/api/billing/portal'].includes(path) || request.method !== 'POST')
        return null;
    const workspaceId = request.headers.get('x-workspace-id');
    const ws = await membership(env.DB, user.id, workspaceId);
    requireRole(ws.role, 'owner');
    verifyMode(env);
    if (env.STRIPE_MODE === 'live') {
        const state = await readiness(env);
        if (!state.ready)
            throw new HttpError(503, 'Paid launch is blocked by incomplete release evidence.', 'release_blocked');
    }
    else if (env.ENABLE_SANDBOX_CHECKOUT !== 'true')
        throw new HttpError(503, 'Sandbox checkout is not enabled.');
    const stripe = await makeStripe(env), customerId = await customerFor(env, stripe, ws, user);
    if (path.endsWith('/portal')) {
        const portal = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${env.APP_ORIGIN}/` });
        if (!/^https:\/\/billing\.stripe\.com\//.test(portal.url || ''))
            throw new HttpError(502, 'Unexpected billing portal URL.');
        return json({ url: portal.url });
    }
    const body = await jsonBody(request, 8192), plan = body.plan;
    if (!Object.hasOwn(PLANS, plan))
        throw new HttpError(400, 'Unknown subscription plan.');
    const requestId = text(body.requestId, 64, true);
    if (!/^[a-f0-9-]{36}$/.test(requestId))
        throw new HttpError(400, 'A checkout request UUID is required.');
    const priceId = env[PLANS[plan].priceEnv];
    if (!/^price_/.test(priceId || ''))
        throw new HttpError(503, 'The selected Stripe price is not configured.');
    const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
    if (!price.active || price.currency !== 'aud' || price.recurring?.interval !== 'month' || price.recurring?.interval_count !== 1 || price.unit_amount !== PLANS[plan].audMonthly * 100 || price.livemode !== (env.STRIPE_MODE === 'live') || price.tax_behavior !== 'exclusive')
        throw new HttpError(503, 'The configured price does not match this published plan.');
    const autoTax = await assertTaxReady(env, stripe);
    if (autoTax && (!price.product || typeof price.product === 'string' || !price.product.tax_code))
        throw new HttpError(503, 'The plan product needs a reviewed tax code before automatic tax can be used.');
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
    if (subscriptions.has_more)
        throw new HttpError(503, 'Billing reconciliation requires review.');
    if (subscriptions.data.some(s => !['canceled', 'incomplete_expired'].includes(s.status)))
        throw new HttpError(409, 'A subscription already exists. Use the billing portal to change it.', 'subscription_exists');
    const now = nowSeconds();
    const attempt = await env.DB.prepare(`INSERT INTO checkout_attempts(workspace_id,request_id,plan,expires_at) VALUES(?,?,?,?)
    ON CONFLICT(workspace_id) DO UPDATE SET request_id=excluded.request_id,plan=excluded.plan,expires_at=excluded.expires_at,session_id=NULL,url=NULL
    WHERE checkout_attempts.expires_at<=? RETURNING *`).bind(ws.id, requestId, plan, now + 3600, now).first();
    const active = attempt || await env.DB.prepare('SELECT * FROM checkout_attempts WHERE workspace_id=?').bind(ws.id).first();
    if (active.request_id !== requestId || active.plan !== plan)
        throw new HttpError(409, 'A checkout is already pending. Resume it rather than opening another.', 'checkout_pending');
    if (active.url)
        return json({ url: active.url });
    const suffix = (await sha256(requestId)).slice(0, 8).split('').map(x => String.fromCharCode(97 + parseInt(x, 16))).join('');
    const checkout = await stripe.checkout.sessions.create({
        mode: 'subscription', customer: customerId, line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${env.APP_ORIGIN}/?checkout=complete`, cancel_url: `${env.APP_ORIGIN}/?checkout=cancelled`,
        expires_at: active.expires_at, automatic_tax: { enabled: autoTax },
        customer_update: { address: 'auto' }, billing_address_collection: 'required', tax_id_collection: { enabled: true },
        integration_identifier: `property-report-saas-${suffix}`
    }, { idempotencyKey: `pr-saas-checkout-${ws.id}-${requestId}` });
    if (!/^https:\/\/checkout\.stripe\.com\//.test(checkout.url || ''))
        throw new HttpError(502, 'Unexpected checkout URL.');
    await env.DB.prepare('UPDATE checkout_attempts SET session_id=?,url=? WHERE workspace_id=? AND request_id=?').bind(checkout.id, checkout.url, ws.id, requestId).run();
    await auditStatement(env.DB, ws.id, user.id, 'billing.checkout_created', checkout.id, { plan }).run();
    // No access is granted by this endpoint or by the success URL.
    return json({ url: checkout.url });
}
async function recordIgnored(env, event, payloadHash) {
    await env.DB.prepare('INSERT INTO billing_events(id,type,created_at,payload_hash,processed_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(event.id, event.type, event.created, payloadHash, nowSeconds()).run();
}
async function eventCustomer(stripe, event) {
    const object = event.data?.object;
    if (!object)
        throw new HttpError(400, 'Missing webhook object.');
    if (event.type.startsWith('customer.subscription.'))
        return ref((await stripe.subscriptions.retrieve(object.id)).customer);
    if (event.type.startsWith('invoice.'))
        return ref((await stripe.invoices.retrieve(object.id)).customer);
    if (event.type.startsWith('checkout.session.')) {
        const session = await stripe.checkout.sessions.retrieve(object.id);
        return session.mode === 'subscription' ? ref(session.customer) : null;
    }
    if (event.type === 'charge.refunded')
        return ref((await stripe.charges.retrieve(object.id)).customer);
    if (['charge.dispute.created', 'radar.early_fraud_warning.created'].includes(event.type)) {
        const chargeId = ref(object.charge);
        if (!chargeId)
            throw new HttpError(503, 'Cannot resolve billing risk charge.');
        return ref((await stripe.charges.retrieve(chargeId)).customer);
    }
    return null;
}
export async function billingWebhook(request, env, makeStripe = stripeClient) {
    if (new URL(request.url).pathname !== '/api/billing/webhook' || request.method !== 'POST')
        return null;
    const raw = new TextDecoder().decode(await limitedBytes(request, 1024 * 1024));
    await verifyStripeSignature(raw, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET);
    let event;
    try {
        event = JSON.parse(raw);
    }
    catch {
        throw new HttpError(400, 'Invalid webhook JSON.');
    }
    if (!/^evt_/.test(event.id || '') || !Number.isSafeInteger(event.created) || typeof event.type !== 'string')
        throw new HttpError(400, 'Invalid Stripe event.');
    verifyMode(env);
    if (event.livemode !== (env.STRIPE_MODE === 'live'))
        throw new HttpError(400, 'Webhook environment mismatch.');
    const hash = await sha256(raw);
    const seen = await env.DB.prepare('SELECT payload_hash FROM billing_events WHERE id=?').bind(event.id).first();
    if (seen) {
        if (seen.payload_hash !== hash)
            throw new HttpError(400, 'Event identity was reused with different contents.');
        return json({ received: true, duplicate: true });
    }
    if (!BILLING_EVENTS.includes(event.type)) {
        await recordIgnored(env, event, hash);
        return json({ received: true, ignored: true });
    }
    const stripe = await makeStripe(env), customerId = await eventCustomer(stripe, event);
    const owner = customerId ? await env.DB.prepare('SELECT workspace_id FROM billing_customers WHERE customer_id=?').bind(customerId).first() : null;
    if (!owner) {
        await recordIgnored(env, event, hash);
        return json({ received: true, ignored: true });
    }
    const ws = owner.workspace_id, lockToken = crypto.randomUUID(), now = nowSeconds();
    const lock = await env.DB.prepare(`INSERT INTO billing_locks(workspace_id,token,expires_at) VALUES(?,?,?)
    ON CONFLICT(workspace_id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE billing_locks.expires_at<=?
    RETURNING token`).bind(ws, lockToken, now + 60, now).first();
    if (!lock || lock.token !== lockToken)
        throw new HttpError(503, 'Billing reconciliation is busy. Stripe should retry.');
    try {
        const again = await env.DB.prepare('SELECT id FROM billing_events WHERE id=?').bind(event.id).first();
        if (again)
            return json({ received: true, duplicate: true });
        // Read authoritative CURRENT subscriptions under a per-workspace lease. Old or reordered events cannot restore stale access.
        const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
        if (subscriptions.has_more)
            throw new HttpError(503, 'Billing reconciliation requires review.');
        const valid = subscriptions.data.filter(s => ref(s.customer) === customerId && s.items?.data?.length === 1 && planForPrice(env, ref(s.items.data[0].price)));
        const current = valid.filter(s => !['canceled', 'incomplete_expired'].includes(s.status)).sort((a, b) => b.created - a.created)[0] || valid.sort((a, b) => b.created - a.created)[0];
        const stillHeld = await env.DB.prepare('SELECT token FROM billing_locks WHERE workspace_id=? AND token=? AND expires_at>?').bind(ws, lockToken, nowSeconds()).first();
        if (!stillHeld)
            throw new HttpError(503, 'Billing lease expired. Stripe should retry.');
        const guardId = crypto.randomUUID();
        const statements = [env.DB.prepare(`INSERT INTO transaction_guards(id,approved)
      VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM billing_locks WHERE workspace_id=? AND token=? AND expires_at>unixepoch()) THEN 1 ELSE 0 END)`)
                .bind(guardId, ws, lockToken)];
        if (current) {
            const priceId = ref(current.items.data[0].price), plan = planForPrice(env, priceId);
            const end = Number(current.items.data[0].current_period_end || current.current_period_end || current.trial_end || 0);
            const safeEnd = Number.isSafeInteger(end) ? end : 0;
            statements.push(env.DB.prepare(`INSERT INTO subscriptions(workspace_id,subscription_id,status,price_id,plan,access_until,cancel_at_period_end,last_event_created,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET subscription_id=excluded.subscription_id,status=excluded.status,
        price_id=excluded.price_id,plan=excluded.plan,access_until=excluded.access_until,cancel_at_period_end=excluded.cancel_at_period_end,
        last_event_created=MAX(subscriptions.last_event_created,excluded.last_event_created),updated_at=excluded.updated_at`).bind(ws, current.id, current.status, priceId, plan, safeEnd, current.cancel_at_period_end ? 1 : 0, event.created, nowSeconds()));
        }
        else {
            // Unknown prices or removed subscriptions must never keep previously cached paid write access.
            statements.push(env.DB.prepare("UPDATE subscriptions SET status='unrecognised',access_until=0,updated_at=? WHERE workspace_id=?").bind(nowSeconds(), ws));
        }
        if (['charge.dispute.created', 'charge.refunded', 'radar.early_fraud_warning.created'].includes(event.type)) {
            let shouldHold = true;
            if (event.type === 'charge.refunded') {
                const charge = await stripe.charges.retrieve(event.data.object.id);
                shouldHold = charge.refunded === true || (charge.amount_refunded > 0 && charge.amount_refunded >= charge.amount);
            }
            statements.push(env.DB.prepare('INSERT INTO billing_risks(event_id,workspace_id,type,stripe_object_id,created_at,resolved_at) VALUES(?,?,?,?,?,?)').bind(event.id, ws, event.type, event.data.object.id, nowSeconds(), shouldHold ? null : nowSeconds()));
            if (shouldHold)
                statements.push(env.DB.prepare('UPDATE workspaces SET billing_hold=1 WHERE id=?').bind(ws));
        }
        statements.push(env.DB.prepare('INSERT INTO billing_events(id,type,created_at,payload_hash,processed_at) VALUES(?,?,?,?,?)').bind(event.id, event.type, event.created, hash, nowSeconds()));
        statements.push(auditStatement(env.DB, ws, 'stripe-webhook', 'billing.reconciled', event.id, { type: event.type, status: current?.status || 'unrecognised' }));
        statements.push(env.DB.prepare('DELETE FROM transaction_guards WHERE id=?').bind(guardId));
        try {
            await env.DB.batch(statements);
        }
        catch (error) {
            if (/transaction_guard_failed/.test(error.message || ''))
                throw new HttpError(503, 'Billing lease expired. Stripe should retry.');
            throw error;
        }
        return json({ received: true });
    }
    finally {
        await env.DB.prepare('DELETE FROM billing_locks WHERE workspace_id=? AND token=?').bind(ws, lockToken).run();
    }
}

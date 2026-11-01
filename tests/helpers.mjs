import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createApp } from '../src/server/index.mjs';
import { nowSeconds, sha256, hex } from '../src/server/security.mjs';
// Real SQLite, with a deliberately small D1 API adapter. This is not a Workers emulator.
export class TestD1 {
    constructor() { this.sqlite = new DatabaseSync(':memory:'); for(const name of readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())this.sqlite.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8')); }
    prepare(sql) { return new Prepared(this, sql, []); }
    async batch(statements) {
        this.sqlite.exec('BEGIN IMMEDIATE');
        try {
            const results = statements.map(s => s.execute());
            this.sqlite.exec('COMMIT');
            return results;
        }
        catch (error) {
            this.sqlite.exec('ROLLBACK');
            throw error;
        }
    }
    close() { this.sqlite.close(); }
}
class Prepared {
    constructor(db, sql, args) { this.db = db; this.sql = sql; this.args = args; }
    bind(...args) { return new Prepared(this.db, this.sql, args); }
    execute() {
        const statement = this.db.sqlite.prepare(this.sql);
        const rows = statement.columns().length ? statement.all(...this.args) : null;
        let changes = 0;
        if (rows === null)
            changes = Number(statement.run(...this.args).changes);
        else if (!/^\s*(SELECT|PRAGMA)/i.test(this.sql))
            changes = Number(this.db.sqlite.prepare('SELECT changes() AS n').get().n);
        return { success: true, results: rows || [], meta: { changes } };
    }
    async run() { return this.execute(); }
    async all() { return this.execute(); }
    async first(column) { const row = this.execute().results[0]; return row ? (column ? row[column] : row) : null; }
}
export class TestR2 {
    constructor() { this.objects = new Map(); this.failPut = false; this.failDelete = false; }
    async put(key, value, options = {}) {
        if (this.failPut)
            throw new Error('Simulated R2 write failure');
        const bytes = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(await new Response(value).arrayBuffer());
        this.objects.set(key, { bytes, options });
        return this.head(key);
    }
    async head(key) { const value = this.objects.get(key); return value ? { key, size: value.bytes.length, customMetadata: value.options.customMetadata, httpMetadata: value.options.httpMetadata } : null; }
    async get(key) { const value = this.objects.get(key); if (!value)
        return null; return { ...await this.head(key), arrayBuffer: async () => new Uint8Array(value.bytes).buffer, body: new Blob([value.bytes]).stream() }; }
    async delete(key) { if (this.failDelete)
        throw new Error('Simulated R2 deletion failure'); for (const item of Array.isArray(key) ? key : [key])
        this.objects.delete(item); }
}
export function stripeMock() {
    const state = { subscriptions: [], sessions: new Map(), customers: new Map(), prices: new Map(), charges: new Map(), invoices: new Map(), createCount: 0, listHook: null };
    for (const [name, amount] of [['solo', 99], ['professional', 249], ['business', 499]])
        state.prices.set(`price_${name}`, { id: `price_${name}`, active: true, currency: 'aud', recurring: { interval: 'month', interval_count: 1 }, unit_amount: amount * 100, livemode: false, tax_behavior: 'exclusive', product: { id: `prod_${name}`, tax_code: 'fixture-reviewed-code' } });
    const api = {
        customers: { create: async () => { const customer = { id: `cus_test_${state.customers.size + 1}` }; state.customers.set(customer.id, customer); return customer; } },
        prices: { retrieve: async (id) => state.prices.get(id) },
        subscriptions: { list: async ({ customer }) => { if (state.listHook)
                await state.listHook(); return { data: state.subscriptions.filter(s => s.customer === customer), has_more: false }; }, retrieve: async (id) => { const s = state.subscriptions.find(s => s.id === id); if (!s)
                throw new Error('Unknown fixture subscription'); return s; } },
        checkout: { sessions: { create: async (params, options) => { state.createCount++; state.lastCheckout = { params, options }; const value = { id: `cs_fixture_${state.createCount}`, mode: 'subscription', customer: params.customer, url: `https://checkout.stripe.com/c/pay/fixture${state.createCount}` }; state.sessions.set(value.id, value); return value; }, retrieve: async (id) => state.sessions.get(id) } },
        billingPortal: { sessions: { create: async () => ({ url: 'https://billing.stripe.com/p/session/fixture' }) } },
        charges: { retrieve: async (id) => state.charges.get(id) },
        invoices: { retrieve: async (id) => state.invoices.get(id) },
        tax: { settings: { retrieve: async () => ({ status: 'active' }) }, registrations: { retrieve: async () => ({ status: 'active' }), list: async () => ({ data: [{ status: 'active' }] }) } }
    };
    return { state, api };
}
export function fixture(t, overrides = {}) {
    const db = new TestD1(), mail = [], reportMail = [], stripe = stripeMock();
    const env = { DB: db, FILES: new TestR2(), BACKUPS: new TestR2(), ASSETS: { fetch: async () => new Response('Development console') }, APP_ORIGIN: 'https://saas.test', ENVIRONMENT: 'staging', PUBLIC_SIGNUP_ENABLED: 'true', TERMS_VERSION: 'fixture-terms-v1', PRIVACY_VERSION: 'fixture-privacy-v1', RELEASE_ID: 'fixture-release', LAUNCH_APPROVED: 'false', STRIPE_MODE: 'test', STRIPE_SECRET_KEY: ['rk', 'test', 'not-a-real-provider-key'].join('_'), STRIPE_WEBHOOK_SECRET: 'fixture-webhook-secret-not-a-provider-credential', STRIPE_PRICE_SOLO: 'price_solo', STRIPE_PRICE_PROFESSIONAL: 'price_professional', STRIPE_PRICE_BUSINESS: 'price_business', STRIPE_TAX_MODE: 'reviewed-not-required', ENABLE_SANDBOX_CHECKOUT: 'true', ...overrides };
    const app = createApp({ mailer: async (_env, to, subject, content, key) => { mail.push({ to, subject, content, key }); }, makeStripe: async () => stripe.api, reportMailer: async(_env,payload,id)=>{if(_env.FAIL_REPORT_MAIL)throw new Error('Simulated mail outage');reportMail.push({payload,id});return 'email_'+id;} });
    t.after(() => db.close());
    async function request(path, { method = 'GET', body, cookie, workspace, headers = {}, origin = true, raw } = {}) {
        const h = new Headers(headers);
        if (origin)
            h.set('Origin', env.APP_ORIGIN);
        if (cookie)
            h.set('Cookie', cookie);
        if (workspace)
            h.set('X-Workspace-Id', workspace);
        if (body !== undefined) {
            h.set('Content-Type', 'application/json');
            body = JSON.stringify(body);
        }
        else
            body = raw;
        const response = await app.fetch(new Request(`${env.APP_ORIGIN}${path}`, { method, headers: h, body }), env);
        const bytes = new Uint8Array(await response.arrayBuffer());
        const content = new TextDecoder().decode(bytes);
        let data = null;
        try {
            data = JSON.parse(content);
        }
        catch { }
        return { status: response.status, headers: response.headers, data, content, bytes };
    }
    async function beginLogin(email) { const result = await request('/api/auth/start', { method: 'POST', body: { email } }); assert.equal(result.status, 202, result.content); const flowCookie = result.headers.getSetCookie().find(v => v.startsWith('__Host-pr_flow=')).split(';')[0]; const token = mail.at(-1).content.match(/#verify=([a-f0-9]+)/)[1]; return { flowCookie, token }; }
    async function login(email) { const { flowCookie, token } = await beginLogin(email); const result = await request('/api/auth/verify', { method: 'POST', body: { token }, cookie: flowCookie }); assert.equal(result.status, 200, result.content); return { email, id: result.data.user.id, cookie: result.headers.getSetCookie().find(v => v.startsWith('__Host-pr_session=')).split(';')[0] }; }
    async function workspace(user, name = 'Example Agency') { const result = await request('/api/workspaces', { method: 'POST', cookie: user.cookie, body: { name, accepted: true, termsVersion: env.TERMS_VERSION, privacyVersion: env.PRIVACY_VERSION } }); assert.equal(result.status, 201, result.content); return result.data; }
    async function property(user, ws, address = '10 Example Street, Perth WA 6000') { const result = await request('/api/properties', { method: 'POST', cookie: user.cookie, workspace: ws.id, body: { address } }); assert.equal(result.status, 201, result.content); return result.data; }
    async function report(user, ws, prop, type = 'Routine') { const result = await request(`/api/properties/${prop.id}/reports`, { method: 'POST', cookie: user.cookie, workspace: ws.id, body: { reportType: type } }); assert.equal(result.status, 201, result.content); return result.data; }
    async function member(user, ws, role) { await db.prepare('INSERT INTO members(workspace_id,user_id,role,created_at) VALUES(?,?,?,?)').bind(ws.id, user.id, role, nowSeconds()).run(); }
    async function sendEvent(event) { const raw = JSON.stringify({ livemode: false, ...event }); return request('/api/billing/webhook', { method: 'POST', origin: false, raw, headers: { 'Stripe-Signature': await signWebhook(raw, env.STRIPE_WEBHOOK_SECRET) } }); }
    return { env, db, mail, reportMail, stripe, app, request, beginLogin, login, workspace, property, report, member, sendEvent };
}
export async function signWebhook(raw, secret, at = nowSeconds()) {
    const encoder = new TextEncoder(), key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return `t=${at},v1=${hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`${at}.${raw}`)))}`;
}
export async function setup(t) { const f = fixture(t), user = await f.login('owner@example.test'), ws = await f.workspace(user), prop = await f.property(user, ws); return { ...f, user, ws, prop }; }
export async function subscribe(f, ws, overrides = {}) {
    const sub = { id: `sub_${ws.id}`, customer: `cus_${ws.id}`, status: 'active', created: nowSeconds(), cancel_at_period_end: false, items: { data: [{ price: { id: 'price_professional' }, current_period_end: nowSeconds() + 86400 }] }, ...overrides };
    await f.db.prepare('INSERT INTO billing_customers(workspace_id,customer_id) VALUES(?,?) ON CONFLICT(workspace_id) DO NOTHING').bind(ws.id, sub.customer).run();
    f.stripe.state.subscriptions.push(sub);
    return sub;
}
// A real 1x1 JPEG. Decoder tests check structure; this is not an image-processing audit.
export const JPEG = new Uint8Array(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=', 'base64'));

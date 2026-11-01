import { HttpError, nowSeconds } from './security.mjs';
import { IMPLEMENTATION_GAPS } from '../shared/implementation-status.mjs';
// Proposed commercial terms. They are NOT live Stripe products or approved prices.
export const PLANS = Object.freeze({
    solo: Object.freeze({ label: 'Solo', audMonthly: 99, seats: 1, properties: 100, reportsPerMonth: 100, bytes: 2 * 1024 ** 3, priceEnv: 'STRIPE_PRICE_SOLO' }),
    professional: Object.freeze({ label: 'Professional', audMonthly: 249, seats: 5, properties: 1000, reportsPerMonth: 1000, bytes: 20 * 1024 ** 3, priceEnv: 'STRIPE_PRICE_PROFESSIONAL' }),
    business: Object.freeze({ label: 'Business', audMonthly: 499, seats: 15, properties: 5000, reportsPerMonth: 5000, bytes: 100 * 1024 ** 3, priceEnv: 'STRIPE_PRICE_BUSINESS' })
});
export async function entitlement(db, workspaceId, now = nowSeconds()) {
    const ws = await db.prepare('SELECT * FROM workspaces WHERE id=? AND archived_at IS NULL').bind(workspaceId).first();
    if (!ws)
        throw new HttpError(404, 'Workspace not found.');
    const sub = await db.prepare('SELECT * FROM subscriptions WHERE workspace_id=?').bind(workspaceId).first();
    if (ws.billing_hold)
        return { canWrite: false, reason: 'billing_review', plan: sub?.plan || 'solo', limits: PLANS[sub?.plan] || PLANS.solo };
    if (sub && ['active', 'trialing'].includes(sub.status) && sub.access_until > now)
        return { canWrite: true, reason: sub.status, plan: sub.plan, limits: PLANS[sub.plan] };
    if (!sub && ws.trial_ends_at > now)
        return { canWrite: true, reason: 'trial', plan: 'professional', limits: { ...PLANS.professional, reportsPerMonth: 25, bytes: 1024 ** 3 } };
    return { canWrite: false, reason: sub?.status || 'trial_expired', plan: sub?.plan || 'solo', limits: PLANS[sub?.plan] || PLANS.solo };
}
export async function requireWritePlan(db, workspaceId) {
    const access = await entitlement(db, workspaceId);
    if (!access.canWrite)
        throw new HttpError(402, 'An active subscription is required for changes. Existing records remain readable and exportable.', 'subscription_required');
    return access;
}
export function allowed(role, permission) {
    const roles = { read: ['owner', 'admin', 'editor', 'viewer'], write: ['owner', 'admin', 'editor'], admin: ['owner', 'admin'], owner: ['owner'] };
    return (roles[permission] || []).includes(role);
}
export function requireRole(role, permission) { if (!allowed(role, permission))
    throw new HttpError(403, 'Your role does not permit this action.', 'role_forbidden'); }
export const RELEASE_CHECKS = Object.freeze(['ownership-and-licensing', 'terms-and-privacy', 'tenant-isolation', 'stripe-sandbox-lifecycle', 'stripe-tax-review', 'object-restore-drill', 'database-restore-drill', 'report-renderer-acceptance', 'wa-form1-acceptance', 'security-review', 'browser-device-acceptance']);
export async function readiness(env) {
    const rows = await env.DB.prepare('SELECT * FROM release_evidence WHERE release_id=? AND expires_at>?').bind(env.RELEASE_ID || 'unreleased', nowSeconds()).all();
    const evidence = new Set((rows.results || []).filter(r => /^[a-f0-9]{64}$/.test(r.evidence_sha256) && r.approved_by && /^https:\/\//.test(r.evidence_uri)).map(r => r.key));
    const blockers = [...IMPLEMENTATION_GAPS, ...RELEASE_CHECKS.filter(check => !evidence.has(check))];
    if (!/^[a-f0-9]{64}$/i.test(env.DELIVERY_ENCRYPTION_KEY||'') || !env.RESEND_WEBHOOK_SECRET)
        blockers.push('encrypted-delivery-and-provider-webhook-configuration');
    if (!env.ARCHIVE_ORIGIN || !env.ARCHIVE_KEY_ID || !/^[a-f0-9]{64}$/i.test(env.ARCHIVE_ENCRYPTION_KEY||'') || !/^[a-f0-9]{64}$/i.test(env.ARCHIVE_UPLOAD_KEY||''))
        blockers.push('independent-encrypted-archive-configuration');
    const databaseBackup = await env.DB.prepare("SELECT completed_at FROM backup_status WHERE kind='database-archive'").first();
    if (!databaseBackup || databaseBackup.completed_at < nowSeconds()-172800) blockers.push('recent-independent-database-backup');
    if (!env.FILES || !env.BACKUPS)
        blockers.push('separate-file-and-backup-bindings');
    if (env.TERMS_VERSION === 'unapproved' || !env.TERMS_VERSION)
        blockers.push('approved-terms-version');
    if (env.PRIVACY_VERSION === 'unapproved' || !env.PRIVACY_VERSION)
        blockers.push('approved-privacy-version');
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM)
        blockers.push('verified-email-configuration');
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET)
        blockers.push('stripe-credentials-and-webhook');
    for (const plan of Object.values(PLANS))
        if (!/^price_/.test(env[plan.priceEnv] || ''))
            blockers.push(plan.priceEnv);
    if (!['active-registration', 'reviewed-not-required'].includes(env.STRIPE_TAX_MODE))
        blockers.push('tax-configuration');
    if (env.STRIPE_MODE !== 'live')
        blockers.push('stripe-live-mode');
    if (env.LAUNCH_APPROVED !== 'true')
        blockers.push('owner-launch-approval');
    return { ready: blockers.length === 0, blockers, releaseId: env.RELEASE_ID || 'unreleased' };
}

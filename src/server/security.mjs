const encoder = new TextEncoder();
export class HttpError extends Error {
    constructor(status, message, code = 'request_failed') { super(message); this.status = status; this.code = code; }
}
export const nowSeconds = () => Math.floor(Date.now() / 1000);
export const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
export const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export async function sha256(value) { return hex(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? encoder.encode(value) : value)); }
export function emailAddress(value) {
    const email = String(value || '').trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))
        throw new HttpError(400, 'Enter a valid email address.', 'invalid_email');
    return email;
}
export function text(value, max = 500, required = false) {
    if (typeof value !== 'string') {
        if (required)
            throw new HttpError(400, 'A required text field is missing.');
        return '';
    }
    const result = value.trim();
    if ((required && !result) || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result))
        throw new HttpError(400, 'A text field is missing or exceeds its allowed length.');
    return result;
}
export function safeId(value) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(String(value)))
        throw new HttpError(400, 'Invalid resource identifier.');
    return String(value);
}
export function isLocalDevelopment(request, env) {
    const u = new URL(request.url);
    return env.ENVIRONMENT === 'development' && u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
}
export function cookieName(request, env, suffix = 'session') { return `${isLocalDevelopment(request, env) ? 'pr' : '__Host-pr'}_${suffix}`; }
export function readCookie(request, name) {
    const values = (request.headers.get('cookie') || '').split(';').map(x => x.trim()).filter(x => x.startsWith(`${name}=`));
    if (values.length !== 1)
        return null;
    return values[0].slice(name.length + 1);
}
export function cookie(request, env, suffix, token, maxAge) {
    return `${cookieName(request, env, suffix)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isLocalDevelopment(request, env) ? '' : '; Secure'}`;
}
export function originCheck(request, env) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method))
        return;
    const configured = new URL(env.APP_ORIGIN).origin;
    if (new URL(request.url).origin !== configured || request.headers.get('origin') !== configured)
        throw new HttpError(403, 'Request origin is not permitted.', 'origin_rejected');
    const site = request.headers.get('sec-fetch-site');
    if (site && !['same-origin', 'none'].includes(site))
        throw new HttpError(403, 'Cross-site request rejected.', 'origin_rejected');
}
export async function limitedBytes(request, limit) {
    const length = Number(request.headers.get('content-length') || 0);
    if (length > limit)
        throw new HttpError(413, 'Request is too large.');
    if (!request.body)
        return new Uint8Array();
    const reader = request.body.getReader();
    const chunks = [];
    let size = 0;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done)
                break;
            size += value.byteLength;
            if (size > limit) {
                await reader.cancel();
                throw new HttpError(413, 'Request is too large.');
            }
            chunks.push(value);
        }
    }
    finally {
        reader.releaseLock();
    }
    const out = new Uint8Array(size);
    let position = 0;
    for (const chunk of chunks) {
        out.set(chunk, position);
        position += chunk.length;
    }
    return out;
}
export async function jsonBody(request, limit = 1024 * 1024) {
    if (!(request.headers.get('content-type') || '').startsWith('application/json'))
        throw new HttpError(415, 'Expected application/json.');
    try {
        const body = JSON.parse(new TextDecoder().decode(await limitedBytes(request, limit)));
        if (!body || typeof body !== 'object' || Array.isArray(body))
            throw new Error('object required');
        return body;
    }
    catch (e) {
        if (e instanceof HttpError)
            throw e;
        throw new HttpError(400, 'Invalid JSON request.');
    }
}
export function json(value, status = 200, headers = {}) { return Response.json(value, { status, headers }); }
export function secureResponse(response, requestId, env = {}) {
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()');
    headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self' blob:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (env.GOOGLE_DRIVE_ENABLED === 'true') {
        headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' https://accounts.google.com https://apis.google.com; style-src 'self' 'unsafe-inline' https://accounts.google.com; img-src 'self' data: blob:; connect-src 'self' https://www.googleapis.com https://accounts.google.com; frame-src 'self' blob: https://accounts.google.com https://docs.google.com https://drive.google.com; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    }
    headers.set('X-Request-ID', requestId);
    return new Response(response.body, { status: response.status, headers });
}
export async function rateLimit(db, key, limit, seconds = 900) {
    const now = nowSeconds();
    const result = await db.prepare(`INSERT INTO rate_limits(key,window_start,count) VALUES(?,?,1)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window_start <= ? THEN 1 ELSE count+1 END,
    window_start=CASE WHEN window_start <= ? THEN excluded.window_start ELSE window_start END
    RETURNING count`).bind(key, now, now - seconds, now - seconds).first();
    if (result.count > limit)
        throw new HttpError(429, 'Too many requests. Try again later.', 'rate_limited');
}
export async function verifyStripeSignature(raw, header, secret, now = nowSeconds()) {
    if (!secret || !header)
        throw new HttpError(400, 'Invalid webhook signature.', 'invalid_signature');
    const fields = header.split(',').map(part => part.trim().split('='));
    const timestamps = fields.filter(([k]) => k === 't');
    const timestamp = Number(timestamps[0]?.[1]);
    if (timestamps.length !== 1 || !Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > 300)
        throw new HttpError(400, 'Expired or invalid webhook signature.', 'invalid_signature');
    const signatures = fields.filter(([k, v]) => k === 'v1' && /^[a-f0-9]{64}$/i.test(v)).map(([, v]) => Uint8Array.from(v.match(/../g), h => parseInt(h, 16)));
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const data = encoder.encode(`${timestamp}.${raw}`);
    for (const signature of signatures)
        if (await crypto.subtle.verify('HMAC', key, signature, data))
            return;
    throw new HttpError(400, 'Invalid webhook signature.', 'invalid_signature');
}

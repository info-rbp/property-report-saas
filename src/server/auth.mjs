import { HttpError, randomToken, sha256, emailAddress, nowSeconds, readCookie, cookie, cookieName, rateLimit, json, jsonBody } from './security.mjs';
export async function sendEmail(env, to, subject, content, idempotencyKey) {
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM)
        throw new HttpError(503, 'Email is not configured.');
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text: content }), signal: AbortSignal.timeout(15000) });
    if (!response.ok)
        throw new HttpError(503, 'Email service did not accept the message.');
    return response.json();
}
export async function currentUser(request, env) {
    const raw = readCookie(request, cookieName(request, env));
    if (!raw || !/^[a-f0-9]{64}$/.test(raw))
        throw new HttpError(401, 'Sign in to continue.', 'authentication_required');
    const user = await env.DB.prepare(`SELECT u.id,u.email,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).bind(await sha256(raw), nowSeconds()).first();
    if (!user)
        throw new HttpError(401, 'Your session has expired. Sign in again.', 'authentication_required');
    return user;
}
export async function authRoutes(request, env, mailer = sendEmail) {
    const path = new URL(request.url).pathname;
    if (path === '/api/auth/start' && request.method === 'POST') {
        const body = await jsonBody(request, 8192);
        const email = emailAddress(body.email);
        // Suspending new registrations must not lock out existing customers.
        // Existing users still need a verified, single-use email challenge.
        if (env.PUBLIC_SIGNUP_ENABLED !== 'true') {
            const existing = await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
            if (!existing) throw new HttpError(503, 'New customer registration is not open.');
        }
        const ip = request.headers.get('cf-connecting-ip') || 'local';
        await rateLimit(env.DB, `login-ip:${await sha256(ip)}`, 20);
        await rateLimit(env.DB, `login-email:${await sha256(email)}`, 5);
        const token = randomToken(), flow = randomToken(), now = nowSeconds();
        const tokenHash = await sha256(token);
        await env.DB.prepare('INSERT INTO login_challenges(token_hash,email,flow_hash,expires_at) VALUES(?,?,?,?)').bind(tokenHash, email, await sha256(flow), now + 900).run();
        try {
            await mailer(env, email, 'Your Property Reports sign-in link', `Open this link in the same browser where you requested it. It expires in 15 minutes.\n\n${env.APP_ORIGIN}/#verify=${token}\n\nNo link is consumed by an email scanner or a page-view request.`, `login-${tokenHash}`);
        }
        catch (e) {
            await env.DB.prepare('DELETE FROM login_challenges WHERE token_hash=?').bind(tokenHash).run();
            throw e;
        }
        return json({ message: 'A sign-in link has been sent. Open it in the same browser.' }, 202, { 'Set-Cookie': cookie(request, env, 'flow', flow, 900) });
    }
    if (path === '/api/auth/verify' && request.method === 'POST') {
        const body = await jsonBody(request, 8192), flow = readCookie(request, cookieName(request, env, 'flow'));
        if (!flow || !/^[a-f0-9]{64}$/.test(body.token || ''))
            throw new HttpError(400, 'Invalid or expired sign-in link.');
        const now = nowSeconds(), hash = await sha256(body.token), flowHash = await sha256(flow);
        // DELETE ... RETURNING atomically consumes a token; concurrent replays cannot create sessions.
        const challenge = await env.DB.prepare('DELETE FROM login_challenges WHERE token_hash=? AND flow_hash=? AND expires_at>? RETURNING email').bind(hash, flowHash, now).first();
        if (!challenge)
            throw new HttpError(400, 'Invalid or expired sign-in link.');
        const id = crypto.randomUUID();
        await env.DB.prepare('INSERT INTO users(id,email,created_at) VALUES(?,?,?) ON CONFLICT(email) DO NOTHING').bind(id, challenge.email, now).run();
        const user = await env.DB.prepare('SELECT id,email FROM users WHERE email=?').bind(challenge.email).first();
        const session = randomToken();
        await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').bind(await sha256(session), user.id, now + 43200, now).run();
        const headers = new Headers();
        headers.append('Set-Cookie', cookie(request, env, 'session', session, 43200));
        headers.append('Set-Cookie', cookie(request, env, 'flow', '', 0));
        return json({ user }, 200, headers);
    }
    if (path === '/api/auth/logout' && request.method === 'POST') {
        const token = readCookie(request, cookieName(request, env));
        if (token)
            await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(token)).run();
        return json({ success: true }, 200, { 'Set-Cookie': cookie(request, env, 'session', '', 0) });
    }
    return null;
}

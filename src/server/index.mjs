import { HttpError, json, originCheck, secureResponse } from './security.mjs';
import { authRoutes, currentUser, sendEmail } from './auth.mjs';
import { workspaceRoutes } from './workspaces.mjs';
import { billingRoutes, billingWebhook, stripeClient } from './billing.mjs';
import {drainArchive,archiveRoutes} from './archive.mjs';
import { brandingRoutes } from './branding.mjs';
import { reportRoutes } from './reports.mjs';
import {workflowRoutes,publicSigningRoutes,resendWebhook,resumeWorkflows,resendReportMailer} from './workflows.mjs';
import { recoveryRoutes, scheduledMaintenance } from './recovery.mjs';
export function createApp({ mailer = sendEmail, makeStripe = stripeClient, reportMailer = resendReportMailer } = {}) {
    return {
        async scheduled(_controller, env) { await scheduledMaintenance(env);await resumeWorkflows(env,reportMailer);await drainArchive(env); },
        async fetch(request, env) {
            const requestId = crypto.randomUUID();
            try {
                const url = new URL(request.url);
                if (!env.APP_ORIGIN)
                    throw new HttpError(503, 'The application origin is not configured.');
                if (url.origin !== new URL(env.APP_ORIGIN).origin)
                    throw new HttpError(421, 'Use the configured application hostname.');
                if (request.method === 'OPTIONS')
                    return secureResponse(json({ error: 'Cross-origin API requests are not supported.' }, 405), requestId, env);
                if (url.pathname === '/api/health' && request.method === 'GET')
                    return secureResponse(json({ status: 'ok', release: 'development-candidate', paidLaunchEnabled: false }), requestId, env);
                // Only a signed Stripe webhook is exempt from same-origin browser checks.
                const webhook = await billingWebhook(request, env, makeStripe) || await resendWebhook(request,env);
                if (webhook)
                    return secureResponse(webhook, requestId, env);
                originCheck(request, env);
                const signing = await publicSigningRoutes(request,env,reportMailer);
                if(signing)return secureResponse(signing,requestId,env);
                const auth = await authRoutes(request, env, mailer);
                if (auth)
                    return secureResponse(auth, requestId, env);
                if (!url.pathname.startsWith('/api/')) {
                    if (!['GET', 'HEAD'].includes(request.method))
                        throw new HttpError(405, 'Method not allowed.');
                    const response = await env.ASSETS.fetch(request);
                    return secureResponse(response, requestId, env);
                }
                const user = await currentUser(request, env);
                const response = await archiveRoutes(request,env,user)
                    || await brandingRoutes(request,env,user)
                    || await workspaceRoutes(request, env, user, mailer)
                    || await billingRoutes(request, env, user, makeStripe)
                    || await recoveryRoutes(request, env, user)
                    || await workflowRoutes(request,env,user,reportMailer)
                    || await reportRoutes(request, env, user);
                if (!response)
                    throw new HttpError(404, 'API route not found.');
                return secureResponse(response, requestId, env);
            }
            catch (error) {
                if (error instanceof HttpError)
                    return secureResponse(json({ error: error.message, code: error.code, requestId }, error.status), requestId, env);
                if (/last_owner/.test(error.message || ''))
                    return secureResponse(json({ error: 'The last workspace owner cannot be removed or demoted.', code: 'last_owner', requestId }, 409), requestId, env);
                if (/UNIQUE constraint failed/.test(error.message || ''))
                    return secureResponse(json({ error: 'This record already exists.', code: 'duplicate_record', requestId }, 409), requestId, env);
                if (/completed_report_immutable/.test(error.message || ''))
                    return secureResponse(json({ error: 'Completed reports are immutable.', code: 'report_immutable', requestId }, 409), requestId, env);
                // Never log request bodies, session tokens, keys, photo URLs or raw provider exceptions.
                console.error(JSON.stringify({ event: 'request_failed', requestId, type: error?.name || 'Error' }));
                return secureResponse(json({ error: 'The request could not be completed.', code: 'internal_error', requestId }, 500), requestId, env);
            }
        }
    };
}
export default createApp();

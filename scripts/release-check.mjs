import {readFile} from 'node:fs/promises';
import { IMPLEMENTATION_GAPS } from '../src/shared/implementation-status.mjs';
import { RELEASE_CHECKS } from '../src/server/plans.mjs';
const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
const blocked=[...IMPLEMENTATION_GAPS];
if(config.vars.ENVIRONMENT!=='production')blocked.push('staging-configuration');
if(config.vars.LAUNCH_APPROVED!=='true')blocked.push('owner-launch-approval');
if(!process.env.RELEASE_ACCEPTANCE_FILE)blocked.push(...RELEASE_CHECKS);
else {
 const evidence=JSON.parse(await readFile(process.env.RELEASE_ACCEPTANCE_FILE,'utf8'));
 for(const key of RELEASE_CHECKS) if(!evidence.some(r=>r.key===key&&r.releaseId===config.vars.RELEASE_ID&&r.approvedBy&&/^https:\/\//.test(r.reference||'')&&/^[a-f0-9]{64}$/.test(r.sha256||'')&&Date.parse(r.expiresAt)>Date.now()))blocked.push(key);
}
console.log(JSON.stringify({readyForDeployment:blocked.length===0,blockers:[...new Set(blocked)],note:'Deployment must additionally pass the runtime readiness endpoint. Administrative evidence is not independent certification.'},null,2));
process.exitCode=blocked.length?1:0;

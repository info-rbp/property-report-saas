import fs from 'node:fs';

const config=fs.readFileSync('wrangler.jsonc','utf8');
const smoke=fs.readFileSync('.github/workflows/production-smoke.yml','utf8');
const workflow=fs.readFileSync('worker/workflowPlatform.ts','utf8');
const worker=fs.readFileSync('worker/index.ts','utf8');
const expected='https://signing.proinspect.systems';

function invariant(name:string,condition:boolean){
  if(!condition)throw new Error('PUBLIC SIGNING CHECK FAILED: '+name);
  console.log('PASS: '+name);
}

invariant('workers.dev remains enabled',config.includes('"workers_dev": true'));
invariant('dedicated public signing hostname is attached to the Report Tool Worker',
  config.includes('"pattern": "signing.proinspect.systems"') && config.includes('"custom_domain": true'));
invariant('obsolete marketing-apex signing routes are removed',
  !config.includes('"pattern": "proinspect.systems/sign/*"') &&
  !config.includes('"pattern": "proinspect.systems/api/public/signing/*"') &&
  !config.includes('"pattern": "proinspect.systems/api/public/workflow-health"'));
invariant('public signing base is repository controlled',config.includes('"SIGNING_BASE_URL": "'+expected+'"'));
invariant('public workflow routes execute before staff authentication',
  worker.indexOf('handlePublicWorkflowApi(request, env)') < worker.indexOf('return await handleApi(request, env)'));
invariant('public signing API remains token-scoped',workflow.includes("/api/public/signing/") && workflow.includes('loadPartyByToken'));
invariant('workflow schema readiness is read-only at request time',
  workflow.includes("SELECT COUNT(*) AS count FROM sqlite_master") &&
  !workflow.includes('workflowSchemaReady = env.DB.exec(WORKFLOW_SCHEMA_SQL)'));
invariant('production smoke targets the dedicated public signing hostname',smoke.includes('PUBLIC_ORIGIN="'+expected+'"'));
invariant('production smoke proves ProInspect integration secrets are present',smoke.includes('"proinspectHandoffConfigured":true') && smoke.includes('"proinspectIngestConfigured":true'));
invariant('production smoke boolean checks do not expect quoted true values',
  !smoke.includes('"resendConfigured":true"') &&
  !smoke.includes('"signingBaseConfigured":true"') &&
  !smoke.includes('"proinspectHandoffConfigured":true"') &&
  !smoke.includes('"proinspectIngestConfigured":true"'));
invariant('production smoke proves non-public APIs on the signing hostname remain behind Access',
  smoke.includes('PROTECTED_API="$PUBLIC_ORIGIN/api/me"') && smoke.includes('302|401|403'));
invariant('production smoke proves editor hostname remains behind Access',smoke.includes('https://report.creation.proinspect.systems/') && smoke.includes('302|401|403'));

console.log('Public signing origin contract checks passed.');

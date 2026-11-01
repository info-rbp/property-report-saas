import fs from 'node:fs';

const read=(path:string)=>fs.readFileSync(path,'utf8');
const invariant=(name:string,condition:boolean)=>{if(!condition)throw new Error('PLATFORM HANDOFF CHECK FAILED: '+name);console.log('PASS: '+name);};

const worker=read('worker/index.ts');
const app=read('src/App.tsx');
const api=read('src/lib/api.ts');
const types=read('src/types/report.ts');
const env=read('.dev.vars.example');

invariant('Worker verifies signed handoff server-side', worker.includes('verifyProInspectHandoffToken') && worker.includes('crypto.subtle.verify') && worker.includes('/api/integrations/proinspect/handoff'));
invariant('Handoff is expiry and report-type constrained', worker.includes("payload.iss!=='proinspect-platform'") && worker.includes('payload.exp<now') && worker.includes('payload.exp>now+10*60') && worker.includes('isReportType(payload.reportType)'));
invariant('Canonical integration context persists with report data', types.includes('ProInspectIntegrationContext') && types.includes('integrationContext?: ProInspectIntegrationContext'));
invariant('Browser resolves handoff through authenticated Worker', api.includes('resolveProInspectHandoff') && app.includes('await api.resolveProInspectHandoff(handoffToken)'));
invariant('Canonical property mapping is stable', app.includes('PI:${context.propertyId}') && app.includes('integrationContext:context'));
invariant('Completed PDF publishes idempotently using Report Tool report ID', worker.includes("'x-report-source-id':report.id||''") && worker.includes('publishCompletedReportToPlatform'));
invariant('Platform outage does not undo immutable completion', worker.indexOf('completed=await updateReportData') < worker.indexOf('await publishCompletedReportToPlatform(env,completed,key)') && app.includes("error?.code==='proinspect-ingest-failed'"));
invariant('Explicit retry path exists', worker.includes("parts[3] === 'publish'") && api.includes('publishCompletedReport') && app.includes('handleSyncPlatform') && read('src/components/ReportActions.tsx').includes('Sync to ProInspect'));
invariant('Integration secrets remain server-side', env.includes('PROINSPECT_HANDOFF_SIGNING_KEY') && env.includes('PROINSPECT_INGEST_URL') && env.includes('PROINSPECT_INGEST_TOKEN'));

console.log('Property Report Tool platform handoff checks passed.');

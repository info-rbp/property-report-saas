// Code-level controls are distinct from operational acceptance. Never infer launch approval from this list.
export const IMPLEMENTATION_GAPS = Object.freeze([]);
export const IMPLEMENTED_CONTROLS = Object.freeze([
 'workspace-scoped-data-and-authorisation', 'visual-editor-and-24-template-renderer',
 'trusted-server-side-issued-pdf', 'tenant-safe-delivery-and-signing',
 'encrypted-user-and-workspace-scoped-offline-drafts', 'immutable-corrections-and-cas',
 'encrypted-independent-archive-and-restore-tooling', 'source-verified-wa-form1-dataset',
 'locked-dependencies-and-local-workers-runtime-tests'
]);
// External resources, actual-provider tests, rights, contractual approvals and deployment acceptance
// are separately required by plans.readiness(). An empty code-gap list is NOT production approval.

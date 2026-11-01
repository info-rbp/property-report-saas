# Verification record - 1 November 2026

## Verified application commit

`5b0cc618c4c11172eeed48b1e581d8357ab42712`

GitHub Actions run: https://github.com/info-rbp/property-report-saas/actions/runs/41280428635

**Result: SUCCESS. Every verification step passed.** This record-only documentation update does not change application code.

## Executed checks

- **102 tests passed, zero failures/skips.** Node 22.16.0; real SQLite with D1-shaped adapter; deterministic provider/storage doubles.
- Production frontend build, trusted renderer bundle, TypeScript check, JavaScript syntax/configuration/credential-pattern checks passed.
- Dependency audit at resolution reported zero known vulnerabilities; the hosted high-severity audit gate passed again. This is not a penetration test.
- Locked dependency licence inventory generated.
- Wrangler runtime type generation and deployment dry run passed. No deployment occurred.
- Actual local workerd/Miniflare tests passed: D1 migrations, sessions, workspace creation, cross-customer denial, revision conflicts and server-generated PDF.
- All 24 selectable report types generated readable PDFs. Execution output and two stress fixtures bring the PDF set to 27.
- Current government Form 1 instructions/notes and long Entry closing-tail text verified in extracted issued-PDF output. Thirteen item-linked monthly-report photographs exercise inline continuation.
- Independent archive encryption, tamper rejection, receiver permissions, exact-byte recovery and encrypted offline vault contracts tested with synthetic data.
- GitHub-hosted Playwright Chromium passed visual-editor loading, encrypted offline field-mode activation, offline reload, editing and local persistence, and reconnect/synchronisation verified by reading back the saved commentary from the server. Desktop/mobile screenshots were captured.
- The release safety check confirmed unapproved commercial launch remains blocked.

## Browser defect fixed during hosted verification

Cloudflare's canonical clean editor URL was not initially mapped to the cached HTML shell. The service-worker builder now handles `/editor`, `/editor/` and `/editor.html`, and stores redirect-free shell responses for offline navigation. The strengthened browser test performs an actual offline edit and confirms cloud persistence after reconnect.

Local Chromium navigation was blocked by the local execution environment's administrator policy. No bypass was attempted; browser acceptance was executed on the GitHub-hosted runner.

## Evidence

The passing run's `candidate-verification` artifact contains `runtime-result.json`, browser screenshots, generated PDFs, dependency inventory and the Worker dry-run bundle. The complete job is green, including statutory PDF text checks.

## Not established by these tests

No live Cloudflare resources or custom domain; no real Stripe sandbox or live transaction; no real email recipient/provider delivery; no independent-account production backup/whole-system recovery drill; no physical iOS/Android field test; no independent security, legal, tax or ownership approval.

GitHub issues track hosted/provider acceptance, independent backup/restore, and statutory/commercial/IP approvals. Source-level controls and successful synthetic acceptance do not constitute production launch approval. Synthetic fixture names and photographs are not customer data.

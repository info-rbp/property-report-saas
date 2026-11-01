# Verification record - 1 November 2026

## Executed locally

- **102 tests passed, zero failures/skips.** Node 22.16.0; real SQLite with D1-shaped adapter; deterministic provider/storage doubles.
- Production frontend build, trusted renderer bundle, TypeScript check, JavaScript syntax/configuration/credential-pattern checks passed.
- Wrangler runtime type generation and deployment dry run passed. No deployment occurred.
- Actual local workerd/Miniflare tests passed: D1 migrations, session handling, workspace creation, cross-customer denial, revision conflicts and server-generated PDF.
- All 24 selectable report types generated readable PDFs. Execution output and two stress fixtures bring the PDF set to 27.
- Current government Form 1 instructions/notes and long Entry closing-tail text verified in extracted issued-PDF output. Thirteen item-linked monthly-report photographs exercise inline continuation.
- Retrieved dependency audit reported zero known vulnerabilities at resolution. CI repeats the audit; this is not a penetration test.
- Independent archive encryption, tamper rejection, receiver permissions, exact-byte recovery and encrypted offline vault contracts tested with synthetic data.

## Browser and remote CI

Local Chromium navigation is blocked by the execution environment's administrator policy. No policy bypass was attempted. The repository CI runs Playwright Chromium against the real local Workers runtime and stores desktop/mobile screenshots and a machine-readable result. Use the actual workflow result for the published commit; do not infer it from the local unit-test count.

## Not established by these tests

No live Cloudflare resources or custom domain; no real Stripe sandbox or live transaction; no real email recipient/provider delivery; no independent-account production backup/whole-system recovery drill; no iOS/Android field test; no independent security, legal, tax or ownership approval.

See `artifacts/runtime-result.json`, PDF output, dependency inventory and GitHub Actions artifacts for the checks actually executed by a given run. Synthetic fixture names and photographs are not customer data.

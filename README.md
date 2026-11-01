# Property Report SaaS

A separate, multi-workspace subscription reporting application derived from the ProInspect reporting engine. **Source implementation and local verification are complete for the controls described below; production launch is not approved or deployed.** No original ProInspect production resources are used.

## Implemented

- Independent workspaces, explicit membership checks, owner/admin/editor/viewer roles, invitation and ownership workflows, scoped SQL/object storage and customer exports.
- Browser-bound email sign-in, hashed single-use tokens, session expiry, same-origin mutation checks and rate limits. No development authentication bypass is shipped.
- Twenty-four report types through the original visual inspection editors and deterministic PDF engine: residential, commercial, maintenance, building/strata and custom. Monthly building reports include item-linked inline photo evidence and item ordering.
- Editable observations, report metadata, CSV commentary import, saved property/global layouts, JPEG/PNG/WebP/HEIC device imports, item-linked photos and covers. Optional Google Picker import requires restricted deployment credentials.
- Workspace company details and validated logo assets, including immutable branding snapshots in issued reports.
- PDFs generated on the server from stored report data and checksum-verified photographs. Browser-supplied issued PDFs are not accepted. Final reports are immutable; corrections are separate linked drafts.
- Expiring external signing invitations, sequential/parallel stages, withheld countersigners, explicit consent bound to the issued PDF hash, drawn or typed signatures, required text fields, optional page placements, resumable server execution and per-recipient executed copies.
- Encrypted delivery outbox, provider idempotency and signed Resend delivery/bounce webhooks. API acceptance is not presented as proof of delivery.
- Opt-in encrypted offline drafts and photo outbox scoped to user/workspace/session. Stale revisions stop automatic overwrite. A recovery download includes pending photos. Private API responses are not service-worker cached.
- Stripe Checkout, customer portal, server-selected plans, signed lifecycle/risk webhooks, subscription reconciliation, quotas and read/export access after expiry. Actual provider sandbox acceptance remains required.
- Mirrored media, checksum validation, owner-only restoration, retryable deletion, encrypted upload-only independent archive receiver, scheduled chunked database backup and verified offline restore tooling.
- Protected, versioned WA Form 1 base content, exact source instructions/notes, source checksum and PDF-content regression. This is not statutory certification or an assertion that an inspection has covered every room in a particular property.

## Repository layout

| Path | Purpose |
|---|---|
| `src/server` | Workspace API, authentication, billing, reports, signing, storage/recovery |
| `src/editor` | Tenant-aware React inspection editor, recipient signing and offline vault |
| `public` | Account administration, sign-in and shared static assets |
| `vendor/proinspect` | Pinned original source and attribution; not an independently deployed app |
| `scripts/prepare-engine.mjs` | Auditable build-time adapter for neutral branding and source-verified content |
| `migrations` | New SaaS database only; never apply to the original ProInspect database |
| `archive-worker` | Separate-account, upload-only encrypted archive receiver |
| `compliance` | Government Form 1 source provenance and protected content |
| `tests` | SQLite, simulated-provider, renderer, signing, offline and recovery regression |
| `.github/workflows` | Candidate CI and disabled-until-configured independent backup |

## Build and verify

Requires Node 22.16 or later. Dependencies are exactly pinned with an npm lock file.

```sh
npm ci
npm run build
npm run typecheck
npm run check
PDF_OUTPUT_DIR=artifacts/pdfs npm test
npm run licenses
npx wrangler types
npx wrangler deploy --dry-run --outdir artifacts/worker
BROWSER_TEST=0 npm run test:runtime
```

Full browser acceptance installs Playwright Chromium, then runs `npm run test:runtime` without `BROWSER_TEST=0`. Tests create synthetic local data only. `scripts/verify-pdf-output.mjs` additionally uses `pdfinfo` and `pdftotext` from Poppler.

The tracked configuration is a **non-deploying staging candidate**: placeholder database ID, no production route, signup disabled, issuance disabled and live billing disabled. Development testing may explicitly enable staging issuance; every such PDF is visibly marked as a test copy. The generated compatibility date is 2026-10-30, matching the locally verified published workerd runtime.

## Release boundary

Run `npm run release:check` to see the outstanding acceptance categories. A non-zero result is expected until approved evidence and deployment settings exist. Runtime readiness also verifies release-specific evidence, credentials, approved terms/privacy versions, tax setup, separate recovery configuration and a recent database-backup receipt. An empty missing-code list is not launch approval.

Do not reuse production database IDs, buckets, secrets, domains or source-repository migrations. Do not enable real payments as part of a code import. Review [READINESS](docs/READINESS.md), [DEPLOYMENT](docs/DEPLOYMENT.md), [TEST_RESULTS](docs/TEST_RESULTS.md) and [security operations](docs/SECURITY_AND_OPERATIONS.md).

## Commercial terms and licensing

The displayed AUD 99/249/499 monthly prices and plan allowances are proposed test configuration, exclusive of GST where applicable, not approved live offers. Stripe tax collection is blocked until its configured mode is reviewed; automatic tax requires active registrations and verified provider settings. No registration, tax rate, price or live subscription was created by this source implementation.

Original-source ownership and contributor permissions must be verified before licensing to customers. Original third-party notices, particularly `heic-to`/libheif LGPL obligations, remain applicable. A `private: true` package field prevents npm publication; it **does not make the GitHub repository private**. The destination repository was public when accessed.

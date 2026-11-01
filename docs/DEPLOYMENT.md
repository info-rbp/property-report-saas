# Deployment and provider acceptance

The repository is a non-deploying candidate. These operations require separate infrastructure and approved credentials. Never apply SaaS migrations to the original ProInspect D1 database.

## Staging

Create a new D1 database and separate primary/recovery R2 buckets. Set the new domain, database binding ID and bucket names in a reviewed environment config. Configure Worker secrets through Cloudflare's secret store, not commits or command-line literals. Apply all migrations in order to the new database. Build, type-check, dry-run and run CI before staging deployment.

Set `ENVIRONMENT=staging`, `STRIPE_MODE=test`, `LAUNCH_APPROVED=false`. Explicit `ENABLE_STAGING_ISSUE=true` permits only visibly watermarked test PDFs. Use synthetic data. Browser authentication uses email; there is no production login bypass.

## Credentials and settings

- Email: `RESEND_API_KEY`, verified `EMAIL_FROM`, `RESEND_WEBHOOK_SECRET`, 32-byte hex `DELIVERY_ENCRYPTION_KEY`. Configure signed delivery, bounce and complaint events at `/api/email/webhook`.
- Billing: least-privilege Stripe key, `STRIPE_WEBHOOK_SECRET`, three approved Price IDs, pinned API version. Webhook route is `/api/billing/webhook` (verify against `billing.mjs` when configuring). Use a separate sandbox for development and CI. Configure Customer Portal deliberately; test upgrades, downgrades, cancellations, overdue payments, refunds, disputes and fraud warnings. Never grant access from a Checkout success page alone.
- Tax: verify Tax Settings and active registrations before using automatic tax, then perform an actual sandbox calculation. Do not treat `STRIPE_TAX_MODE=active-registration` as evidence that Stripe is configured. It is a deployment assertion that needs corroborating acceptance evidence.
- Independent archive: deploy `archive-worker` in a separately controlled account. Set `ARCHIVE_ORIGIN`, `ARCHIVE_UPLOAD_KEY`, `ARCHIVE_ENCRYPTION_KEY`, `ARCHIVE_KEY_ID`; give the application uploader no archive read/delete authority. Separate archive administration and retain encryption keys securely for the whole retention period.
- Google Drive (optional): restricted browser key, OAuth client and project number via `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_APP_ID`; enable Drive/Picker APIs and exact authorised origins. Set runtime `GOOGLE_DRIVE_ENABLED=true` only when configured. Picker requests `drive.file` for selected-file access; keys/tokens are not stored in the database. Shared-drive/consent/large-image tests remain required.

## Backup and restore

The database backup workflow is disabled unless repository variable `BACKUP_ENABLED=true`. Configure the protected `independent-backup` environment, the listed secrets/variables and failure notifications. It exports to a private temporary file, encrypts bounded chunks, uploads a manifest only after all chunks are acknowledged, records the verified receipt, and deletes local plaintext. Only receipt metadata is uploaded as a CI artifact.

`node scripts/restore-archive.mjs manifest.envelope restored.sql encrypted-chunks/` verifies AEAD, identity, sequence and every checksum. Supply the decryption key through a protected environment, not a command argument. It refuses overwriting an existing output and never changes a live database. Restore into a new isolated D1 database, restore/verify representative media and executed PDFs, test relationships and document counts, record results, then separately approve cutover. Do not enable bucket expiry before retention/holds are approved.

## Production

Obtain current, release-specific acceptance evidence for the categories in `plans.mjs`. Configure approved terms/privacy, verified tax and provider settings, recent database backup and independent archive. Run the release checker and authenticated readiness endpoint. Restrict who can change deployment settings, evidence rows and code. Configure repository rules, protected deployment environments, secret rotation, monitoring and incident contacts. Only an explicitly approved production release may enable real signup, issuance and billing.

Source import and CI do not authorise that production cutover.

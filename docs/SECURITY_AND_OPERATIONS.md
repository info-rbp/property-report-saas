# Security and operational boundaries

All application records require workspace membership; public signing is a narrowly scoped capability token and does not expose account APIs. Roles are enforced server-side. Customer-supplied object keys, branded image URLs and PDF bytes are not trusted as issued evidence. Concurrency compares revisions and keeps completed records immutable.

External signing establishes possession of an expiring invitation and records consent, declared name, timestamp, source-document checksum and field values. It is not verified legal identity or a certificate-backed digital signature. Executed PDFs retain the issued document and append a server-generated record. Signed tokens cannot alter prior signatures.

The outbox distinguishes queued, provider-accepted, delivered and failed states. After a provider idempotency window expires, uncertain deliveries require review rather than risking automatic duplicate transmission. Monitor `review_required`, retry age, signing execution failures, archive job age and backup receipt age. Provider outages must not be misreported as completed delivery or recovery.

Offline mode is opt-in for a trusted device, expires with the session/field window, stores encrypted drafts/photos in IndexedDB and keeps the key only in session storage. A user with access to an unlocked browser session can access that session's work. Signing out purges keys/caches; closing the session can make un-synced drafts unrecoverable. Recovery downloads are explicitly unencrypted and require secure handling. The service worker caches application shell assets, never private API responses.

Archive encryption and an upload-only receiver reduce application-account compromise risk only when hosted under independently controlled credentials. Same-account mirrors alone are not independent disaster recovery. Maintain an offline recovery key inventory by key ID. Rotate by introducing a new key ID while retaining prior keys for old archives. Do not discard the old encryption key while queued envelopes or retained archives depend on it.

Suggested operating targets must be validated, not assumed: daily database snapshots, continuous queued object archival, alerting on oldest unarchived object, failed daily workflow and stale receipts. Backup cadence is not itself a measured recovery point/time objective.

Rights, approved privacy/terms, retention/erasure schedules, provider data-location settings, tax obligations, support contacts and accessibility/device acceptance require business decisions. Closure requests are recorded for review; the application does not automatically erase legally retained evidence or cancel a subscription without an explicit workflow.

The source repository was public at import. No secrets or customer data are included. Set appropriate repository visibility and protection before treating the code as confidential commercial IP. The npm `private` field is unrelated to GitHub visibility.

# Report Workflow Platform - Branch Design

Branch: `feat/report-workflow-platform`

This workstream is deliberately isolated from `main` until the full delivery, signing, Drive import and offline workflows have been acceptance-tested.

## Capabilities in this branch

### Google Drive bulk photo import
- Uses Google Identity Services with `drive.readonly`.
- Opens Google Picker with multi-select image support.
- Downloads selected image bytes in the authenticated browser.
- Sends those files into the same ProInspect compression/upload queue as device photos.
- R2 remains the authoritative report photo store. Reports do not depend on later Google Drive availability.

Required Cloudflare build variables:
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_GOOGLE_API_KEY`

Google configuration:
1. Enable Google Drive API and Google Picker API in the chosen Google Cloud project.
2. Create an OAuth Web Client.
3. Add the production application origins.
4. Create/restrict a browser API key to the ProInspect report/signing origins and the required Google APIs.

## Saved report templates
Migration `0002_workflow_platform.sql` adds `report_templates`.

A template can be:
- global; or
- property-specific.

The template snapshot retains report structure/layout and standard headings but clears:
- report/property IDs;
- photos and cover photo;
- historical narrative/commentary;
- dates/signatures;
- completion metadata.

Creating from a template generates fresh area/item IDs, preventing links to previous report photos.

## Resend report delivery

Required Worker secret:
- `RESEND_API_KEY`

Optional Worker variable:
- `RESEND_FROM_EMAIL`

If `RESEND_FROM_EMAIL` is omitted the Worker defaults to:
- `ProInspect <info@proinspect.systems>`

The sending domain must be verified in Resend.

Send-only delivery:
- requires a completed report;
- always uses the stored completed PDF from R2;
- records recipients, CC, subject, message and delivery status in `report_deliveries`;
- uses a Resend idempotency key;
- uses a conservative 25 MB attachment ceiling so base64/MIME overhead remains below Resend's overall message-size ceiling;
- currently treats successful Resend API acceptance as `sent`.

The branch intentionally does not yet mark emails as `delivered`/bounced from webhooks. Resend webhook integration can be enabled as a later hardening step without changing report/signature data.

## Send & collect signatures

Migration `0002_workflow_platform.sql` adds:
- `report_deliveries`;
- `signature_requests`;
- `signature_parties`;
- `signature_fields`.

Supported flows:
- sequential signing;
- parallel signing within each stage;
- one or more external signatories;
- countersigners, e.g. Property Manager;
- countersigners are withheld until non-countersigners finish;
- drawn browser/mobile signatures;
- typed signatory name;
- optional signatory commentary;
- custom text fields;
- per-field label, prompt and location/purpose description;
- optional PDF page/X/Y/width placement for signature or text fields;
- fields with no page coordinates remain on the dedicated execution/audit page;
- expiring tokenised signing links;
- deterministic executed PDF generation using the same production renderer as issued reports;
- resumable final execution if the final signer's browser closes after signing;
- executed PDF stored in R2;
- fully executed copy sent individually to all parties with fresh 30-day download links.

### Public signing hostname

The staff application is protected by Cloudflare Access. External signatories should not require a ProInspect staff login.

Recommended production setup:
- Staff app: `https://report.creation.proinspect.systems` - Cloudflare Access protected.
- Public signing: `https://sign.proinspect.systems` - same Worker deployment, no staff-only Access policy.

Set Worker variable:
- `SIGNING_BASE_URL=https://sign.proinspect.systems`

The public signing endpoints are deliberately limited to high-entropy, expiring token routes under:
- `/api/public/signing/<token>`

The public hostname must still retain normal Cloudflare TLS/WAF/rate-limiting controls.

## Offline / PWA field mode

The branch adds:
- web app manifest;
- service worker;
- application-shell precaching;
- local cached report restoration;
- IndexedDB mutation outbox;
- offline report saves;
- offline compressed photo blob storage;
- ordered replay after connectivity returns;
- locally queued photo previews survive an offline app reload;
- report photos/covers already viewed on the device are selectively cached for field use;
- atomic D1 compare-and-set updates prevent concurrent browser/device mutations from silently overwriting one another.

Operational workflow:
1. Open the property/report while online before attending site.
2. The opened report is cached locally.
3. If reception disappears, the app enters Offline Field Mode.
4. Commentary/layout changes are stored locally.
5. phone-camera/device photos are compressed and stored as IndexedDB blobs with their intended category/item.
6. When reception returns, queued operations sync in order.
7. If the cloud report changed elsewhere, the existing version check stops automatic overwrite and leaves the offline operations queued for review.

Intentionally online-only:
- creating a brand-new cloud report;
- Google Drive import;
- finalising/issuing a report;
- sending;
- signature-request creation.

## Take Photo

Building Manager reporting items expose a `Take Photo` button.

On compatible mobile browsers:
- the rear/native camera flow is requested with `capture="environment"`;
- the report category and reporting-item ID are already known;
- the captured image enters the existing compression/upload queue;
- when offline, it enters the IndexedDB photo outbox and syncs later.

## Deployment steps before acceptance testing

1. Apply the branch migration:
   `bun run db:migrate:remote`
2. Add `RESEND_API_KEY` using Cloudflare secret storage.
3. Verify the ProInspect sending domain in Resend.
4. Set `RESEND_FROM_EMAIL` if a different sender is required.
5. Create/configure `sign.proinspect.systems` and set `SIGNING_BASE_URL`.
6. Configure the Google OAuth Client and restricted Picker/Drive API key.
7. Set `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_API_KEY` in the Cloudflare build environment.
8. Deploy this branch to a non-production preview/staging hostname.
9. Run the acceptance matrix below.
10. Only then merge to `main`.

## Acceptance matrix

### Email
- send completed PDF to one recipient;
- CC recipient;
- duplicate click/retry does not create duplicate email;
- PDF near attachment threshold;
- invalid recipient;
- Resend API unavailable.

### Signing
- one signer;
- two sequential signers;
- two parallel signers;
- client then Property Manager countersignature;
- multiple countersigners;
- required text field;
- optional commentary;
- expired token;
- reused signed token;
- all parties receive executed copy;
- reopen a signed link before execution finishes and confirm execution resumes;
- place a signature/text field on an existing PDF page by page/X/Y/width;
- leave coordinates blank and confirm the field appears only on the execution page;
- executed PDF contains the complete execution/signature audit page.

### Offline
- open report online, then airplane mode;
- edit several fields;
- capture multiple photos across different items;
- reload the installed PWA while still offline;
- restore cached report;
- reconnect and sync;
- induce a cloud-version conflict from another browser;
- verify offline changes remain queued rather than overwriting the newer report.

### Google Drive
- first-time OAuth consent;
- multi-select 20+ images;
- cancel picker;
- revoked Google token;
- shared-drive image;
- large source images;
- queue Drive imports while other device-photo uploads are running.

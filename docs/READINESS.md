# Resale-readiness implementation and acceptance

Updated 1 November 2026. This repository now contains the integrated SaaS application, not just a foundation ZIP. **No production launch, live billing or legal certification is claimed.**

| Material issue | Implemented control | Remaining external acceptance |
|---|---|---|
| Customer separation | Workspace membership, scoped SQL/storage/export, composite references, negative-access tests | Hosted two-agency isolation and independent security review |
| ProInspect-specific branding | Tenant company details/logo; neutral interface/PDF adapter; no original production Worker or handoff dependency | Approved product identity, sending domain and licence rights |
| Prescribed Form 1 omissions | Protected 88-item, nine-section base, five response columns, six instructions/six notes and source fingerprint; no deletion/renaming of statutory content; issued-PDF text tests | Final prescribed-form/legal review and representative real-property acceptance |
| User roles | Owner/admin/editor/viewer, last-owner protection, invitations, removal, transfer and server enforcement | Identity-provider/email delivery and operational account-security review |
| Billing and onboarding | Workspace creation, terms version acceptance, Checkout/portal, lifecycle/risk events, reconciliation, quotas | Actual isolated Stripe sandbox lifecycle, refunds/disputes, tax calculation, approved prices and support policy |
| Data integrity | Revision comparison, immutable issuance, separate corrections, trusted stored-image PDF output, photo manifest validation | Load/concurrency tests on hosted resources and representative devices |
| Recovery | Mirroring, integrity verification, exact-byte restore, encrypted independent archive receiver, chunked database snapshot/manifest and verified restore scripts | Provision independent account/credentials; whole-system restore into a separate environment; record RPO/RTO and retention approvals |
| Complete reporting workflow | Visual editors, 24 PDFs, photos, CSV/templates, sending, external signatures, offline encrypted drafts | Real-provider delivery/signing, iOS/Android camera/HEIC and offline field trials |
| Source/dependencies | Pinned source provenance, lock file, licence inventory, preserved LGPL notices and CI | Ownership chain, dependency licence clearance, private-repository/branch-protection decision |
| Production release | Non-deploying staging config and explicit release evidence/configuration gates | Approved infrastructure, monitoring, contractual/privacy/tax settings and an authorised release |

## Source and output comparison

Official reference: `https://www.consumerprotection.wa.gov.au/system/files/documents/2025-07/form1propertyconditionreport.docx`.

SHA-256: `3e39e2346956bb6d913ac3ae2c28f3768157a17b8228b4eee1cea0319790d969`.

The comparison corrected the old wording about seven days from moving in to seven days from the tenancy start specified in the agreement. Protecting baseline content does not establish completeness for additional bedrooms/bathrooms or correctness of inspector observations. Additional property-specific content remains permitted.

## Release evidence

Eleven dated, release-specific categories remain required: ownership/licensing; terms/privacy; tenant isolation; Stripe sandbox lifecycle; tax review; object restore; database restore; PDF acceptance; Form 1 acceptance; security review; browser/device acceptance. Evidence records need a reviewer, HTTPS reference, SHA-256 and expiry. Workspace owners cannot approve these through application APIs. Administrators controlling code/database must themselves be controlled; an evidence row is not cryptographic proof of an independent review.

Repository privacy, statutory approval, real provider credentials, tax registrations and independently controlled backup accounts cannot be supplied merely by changing source code. They remain explicit operational requirements, not hidden placeholders represented as completed work.

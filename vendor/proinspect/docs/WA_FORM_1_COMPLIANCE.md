# WA Form 1 compliance review

Reviewed against current Western Australian government sources on 27 September 2026.

## Authoritative sources

- Consumer Protection - Property condition report Form 1:
  https://www.consumerprotection.wa.gov.au/publications/property-condition-report-form-1
- Consumer Protection - Property condition reports:
  https://www.consumerprotection.wa.gov.au/property-condition-reports
- Consumer Protection - Rental forms and notices:
  https://www.consumerprotection.wa.gov.au/rental-forms-and-notices
- Residential Tenancies Regulations 1989, regulation 10AC and Schedule 4 Form 1:
  https://www.legislation.wa.gov.au/

## Current legal position relevant to the application

Regulation 10AC prescribes the information in Schedule 4 Form 1 for a property condition report.

Consumer Protection states that Form 1 must be used. Additional detail may be added, but prescribed items must not be removed.

## Current implementation assessment

The current Entry renderer contains the core Form 1 concepts:
- Form 1 / Residential Tenancies Act 1987 / section 27C(6);
- instructions and important notes;
- residential premises address;
- Clean / Undamaged / Working / Tenant agrees / Comments fields;
- approximate dates when work was last done;
- lessor/property manager and tenant signature/date sections;
- inspection photographs as additional evidence.

## Production gap to resolve in the report-template phase

The current Entry report areas and items are driven by imported CSV data. A CSV can therefore omit one or more prescribed Form 1 items.

That means the current application cannot guarantee that every Entry report contains the complete prescribed Form 1 item set.

Before Entry reports are treated as a locked production template, the template phase must:

1. Define the prescribed Form 1 areas/items as a mandatory base dataset.
2. Prevent mandatory Form 1 items from being removed.
3. Allow ProInspect/user additions without replacing the mandatory items.
4. Preserve the statutory Clean / Undamaged / Working / Tenant agrees / Comments structure.
5. Preserve approximate-work-date fields and both signature/date requirements.
6. Use the current Consumer Protection department/contact wording.
7. Re-check the prescribed form whenever WA legislation or Consumer Protection publishes an updated Form 1.

## Corrections included in the production-hardening pass

- Outdated government department references are replaced with the current Department of Local Government, Industry Regulation and Safety / Consumer Protection wording.
- The current Consumer Protection website is used.
- Prototype/sample property, agent, date and address fallbacks are removed.
- Lessor/property manager signature terminology is used instead of an agent-only label.
- Remote placeholder images are removed.

## Status

Architecture and statutory-content review: complete.

Entry report template certification: pending the dedicated report-template phase because mandatory Form 1 items still need to be made non-removable.

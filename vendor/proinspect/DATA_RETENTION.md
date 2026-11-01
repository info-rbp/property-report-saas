# ProInspect Property Reports - Data Retention and Recovery Policy

This is the operational retention policy for V1. It is not a substitute for any legal, contractual or client-specific record-retention obligation that may apply to a particular report.

## Authoritative storage

- D1 is the authoritative store for Properties and report JSON.
- R2 is the authoritative store for inspection-photo derivatives and completed PDFs.
- IndexedDB is a local resilience cache only and must not be treated as the authoritative copy.

## Draft reports

Draft reports and their R2 photos are retained until a user deletes the draft.

Deleting a draft through the application deletes:
- the D1 report record; and
- all R2 objects under that report's storage prefix.

## Completed reports

Completed reports are immutable through the V1 API.

The completed report record, associated inspection photos and issued PDF are retained without automatic expiry unless ProInspect adopts a later written disposal schedule.

This avoids accidental deletion while the legal/business retention period is being formally determined.

## D1 recovery

Cloudflare D1 Time Travel is automatically available. On the Workers Free plan, the available point-in-time recovery window is currently 7 days.

For recovery beyond the Time Travel window, export the production D1 database periodically and retain the export in an approved secure business backup location.

Repository command:

```bash
bun run db:backup
```

The resulting `backups/` directory is gitignored and must never be committed to GitHub because database exports can contain property and report information.

## R2 recovery

V1 does not configure an automatic object-expiry rule on `proinspect-property-reports-data`.

The application already prevents completed reports from being deleted through its API. R2 objects should therefore remain in place unless deliberately removed by an administrator.

If ProInspect later adopts a formal disposal period, implement it only after the legal/business retention period is confirmed. Avoid bucket-wide expiry rules until then.

## Backup review

At least monthly:
1. confirm D1 is queryable;
2. perform a D1 export to secure business backup storage;
3. confirm the R2 bucket is accessible;
4. confirm at least one completed PDF can be retrieved;
5. record the check in the business operations log.

## Incident recovery

For accidental D1 changes within the available Time Travel window, use D1 Time Travel.

For older D1 recovery, use the most recent approved D1 export.

For R2 object loss, recovery depends on the separate backup process in place at the time. Completed reports must not be manually deleted from R2 without an approved disposal instruction.

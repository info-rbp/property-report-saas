# Report Functionality Freeze

**Freeze review completed:** 28 September 2026

This document records the acceptance baseline for ProInspect report creation and PDF rendering.

## Frozen report scope

The application has 23 selectable report templates across Residential, Commercial, Maintenance, Building / Strata and Custom reporting, plus the hidden legacy Building Management compatibility definition.

The report catalogue, report data model and issued-PDF renderer are treated as functionally frozen after this review. Future changes should be limited to defect fixes or deliberately approved new requirements.

## Rendering acceptance completed

The freeze audit verified the deterministic jsPDF renderer rather than relying on the React screen preview.

Acceptance included:

- production TypeScript validation;
- production Vite build;
- Wrangler deployment dry-run;
- generation of every registered report definition;
- oversized Entry, Routine and generic report commentary;
- long metadata and addresses;
- long Custom Report background, findings, summaries, recommendations and actions;
- extreme Custom Report title wrapping;
- filled Building Manager Daily and Monthly reports;
- long Key Receipt tables;
- schema migration and structural validation checks;
- mixed portrait and landscape JPEG image embedding;
- a 13-photo regression covering the 12-photo gallery-page boundary and continuation page;
- PDF structural preflight across the generated catalogue;
- visual inspection of the full generated catalogue and focused stress outputs;
- Poppler/PDFium renderer parity checks on representative complex PDFs.

## Defects corrected during freeze review

The review identified and corrected:

1. Findings headings could be left isolated on an otherwise blank page when the first finding was exceptionally long.
2. Custom Report continuation headers used the generic "Custom" label instead of the user-defined report title.
3. Extremely long Custom Report cover titles could calculate downstream layout from hidden wrapped lines.
4. Completed Custom Report downloads did not preserve the user-defined report title in the filename.
5. Property report lists did not display the user-defined Custom Report title.
6. Report schema versioning did not explicitly mark the introduction of the Custom Report type.
7. Automated PDF verification did not previously embed actual image bytes or cross the 12-photo gallery boundary.
8. The obsolete direct html2canvas-pro dependency remained after migration to deterministic jsPDF rendering.

## Acceptance rule for future report changes

Any future material change to report data, templates or PDF layout must:

1. pass `bun run lint`;
2. pass `bun run build`;
3. pass `bun run pdf:verify`;
4. pass the Wrangler deployment dry-run;
5. produce the CI PDF regression artifacts;
6. visually review the materially affected PDF artifacts rather than relying only on the browser preview;
7. run PDF preflight for materially changed output;
8. confirm representative device-supplied photographs in production for changes that affect image processing, storage or layout.

The downloaded deterministic PDF remains the authoritative issued layout. The browser report preview is a convenience view and is not the pagination acceptance output.

## Operational acceptance

The renderer is accepted for the frozen report scope. Real-world operational testing should still be performed when a materially changed template, browser image-processing path, or new device/photo format is introduced. That is release acceptance for the changed input path, not unfinished report-template functionality.

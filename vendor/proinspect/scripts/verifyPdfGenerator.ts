import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExtendedReportDocument } from '../src/components/ExtendedReportDocument';
import { ExtendedReportEditor } from '../src/components/ExtendedReportEditor';
import { imageFilesFromList, isHeicImageFile, isReportImageFile, REPORT_IMAGE_ACCEPT } from '../src/lib/photoDrop';
import { buildCustomReportPreviewPages } from '../src/lib/customReportPreview';
import { REPORT_TEMPLATES } from '../src/data/reportCatalogue';
import { createBlankReport } from '../src/data/reportTemplates';
import { formatAustralianDate, renumberPhotosByArea, splitTenantNames } from '../src/lib/reportFormatting';
import { migrateReportData } from '../src/lib/reportMigration';
import { generateReportPdf } from '../src/lib/reportPdf';
import { validateReportForFinalization, validateReportStructure } from '../src/lib/reportValidation';
import { CURRENT_REPORT_SCHEMA_VERSION, ReportData } from '../src/types/report';

if (formatAustralianDate('2026-09-27') !== '27/09/2026') {
  throw new Error('Australian date formatting regression detected.');
}

const tenantNames = splitTenantNames('John Smith & Jane Smith');
if (tenantNames[0] !== 'John Smith' || tenantNames[1] !== 'Jane Smith') {
  throw new Error('Tenant name splitting regression detected.');
}

const renumberedPhotos = renumberPhotosByArea([
  { id: '1', name: 'Entry: Overall (photo 4)', areaName: 'Entry', photoIndex: 4 },
  { id: '2', name: 'Entry: Overall (photo 9)', areaName: 'Entry', photoIndex: 9 },
  { id: '3', name: 'Kitchen: Overall (photo 2)', areaName: 'Kitchen', photoIndex: 2 },
]);
if (
  renumberedPhotos[0].photoIndex !== 1 ||
  renumberedPhotos[1].photoIndex !== 2 ||
  renumberedPhotos[2].photoIndex !== 1
) {
  throw new Error('Photo area renumbering regression detected.');
}

const longComment = [
  'Painted white with general age-related marks and minor scuffing.',
  'Observed condition remains serviceable; note surface variation, wear and minor deterioration.',
  'This deliberately long regression-test commentary verifies that row height is measured from wrapped text and continues onto another page without relying on browser DOM geometry.',
].join(' ').repeat(18);
const extremelyLongComment = longComment.repeat(3);

const LANDSCAPE_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAAyAFADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDmaKKK/TT81CiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/2Q==';
const PORTRAIT_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCABQADIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCaiiivyw/QwooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//2Q==';

const report: ReportData = {
  id: 'pdf-regression-test',
  status: 'draft',
  details: {
    reportType: 'Entry',
    formName: 'Property Condition Report',
    actNotice: 'RESIDENTIAL TENANCIES ACT 1987 (WA) Section 27C(6)',
    formNumber: 'FORM 1',
    governingBody: 'Consumer Protection, Western Australia',
    companyName: 'ProInspect',
    companyAddress: '19 Bonnard Crescent Ashby WA 6065',
    companyPhone: '(08) 9306 9668',
    companyEmail: 'info@proinspect.systems',
    companyWebsite: 'https://proinspect.systems',
    propertyAddress: '2 Reserve Drive, Mandurah WA 6210',
    inspectingAgent: 'PDF Regression Test',
    inspectionDate: '2026-09-27',
    tenancyStartDate: '',
    tenants: 'Tenant One & Tenant Two',
    tenantReceivedDate: '',
    reportReturnDate: '',
    additionalComments: 'Regression test only.',
    agentSignName: 'PDF Regression Test',
    agentSignDate: '2026-09-27',
    disclaimerText: 'Regression test disclaimer.',
  },
  areas: [
    {
      id: 'entry',
      name: 'Entry',
      items: Array.from({ length: 18 }, (_, index) => ({
        id: `entry-${index + 1}`,
        name: `Entry item ${index + 1}`,
        clean: index % 4 !== 0,
        undamaged: index % 5 !== 0,
        working: true,
        agentComments: index === 4 ? longComment : `Normal commentary for entry item ${index + 1}.`,
        tenantAgrees: null,
        tenantComments: '',
      })),
    },
    {
      id: 'kitchen',
      name: 'Kitchen',
      items: Array.from({ length: 26 }, (_, index) => ({
        id: `kitchen-${index + 1}`,
        name: `Kitchen item ${index + 1}`,
        clean: true,
        undamaged: index % 6 !== 0,
        working: index % 7 !== 0,
        agentComments: `Kitchen commentary line ${index + 1}. Additional descriptive text is included to exercise wrapping across the fixed agent-comment column.`,
        tenantAgrees: null,
        tenantComments: '',
      })),
    },
  ],
  photos: [],
};

function pdfPageCount(blob: Blob): Promise<number> {
  return blob.arrayBuffer().then((buffer) => {
    const binary = new TextDecoder('latin1').decode(buffer);
    return (binary.match(/\/Type\s*\/Page\b/g) || []).length;
  });
}

async function verifyPdf(name: string, data: ReportData, minimumPages: number, minimumBytes = 8_000) {
  const blob = await generateReportPdf(data);
  if (blob.size < minimumBytes) {
    throw new Error(`${name} regression PDF is unexpectedly small: ${blob.size} bytes.`);
  }

  const pageCount = await pdfPageCount(blob);
  if (pageCount < minimumPages) {
    throw new Error(`${name} expected at least ${minimumPages} pages, received ${pageCount}.`);
  }

  const outputDir = process.env.PDF_VERIFY_OUTPUT_DIR;
  if (outputDir) {
    const outputPath = `${outputDir}/${name.toLowerCase()}-regression.pdf`;
    await Bun.write(outputPath, blob);
    console.log(`Wrote ${name} PDF regression artifact to ${outputPath}.`);
  } else if (name === 'Entry' && process.env.PDF_VERIFY_OUTPUT) {
    await Bun.write(process.env.PDF_VERIFY_OUTPUT, blob);
  }

  console.log(`${name} PDF regression check passed: ${pageCount} pages, ${blob.size} bytes.`);
}

const routineReport: ReportData = {
  id: 'routine-pdf-regression-test',
  status: 'draft',
  details: {
    reportType: 'Routine',
    formName: 'Routine Inspection Report',
    actNotice: '',
    companyName: 'ProInspect',
    companyAddress: '19 Bonnard Crescent Ashby WA 6065',
    companyPhone: '(08) 9306 9668',
    companyEmail: 'info@proinspect.systems',
    companyWebsite: 'https://proinspect.systems',
    propertyAddress: '87 Medina Ave, Medina WA 6167',
    inspectingAgent: 'Routine Regression Test',
    inspectionDate: '2026-09-27',
    tenancyStartDate: '2026-05-03',
    leaseExpiryDate: '2027-05-02',
    rentReviewDate: '2027-02-02',
    currentRentalAmount: '$560 per week',
    tenants: 'Routine Tenant with a deliberately extended display name used to verify that summary rows wrap safely instead of overflowing the fixed detail column',
    tenantReceivedDate: '',
    reportReturnDate: '',
    additionalComments:
      'The property is presented in generally good condition. Minor observations are recorded in the findings and maintenance section.',
    maintenanceComments:
      'Exterior front - vegetation should be cut back from the gutters. Kitchen - rangehood operation requires follow-up.',
    agentSignName: 'Routine Regression Test',
    agentSignDate: '2026-09-27',
    disclaimerText:
      'This routine inspection report records visible conditions observed at the time of inspection and should be read with the photographs and commentary.',
  },
  areas: [
    {
      id: 'routine-exterior',
      name: 'EXTERIOR FRONT',
      items: [
        {
          id: 'routine-exterior-overall',
          name: 'Overall',
          agentComments: extremelyLongComment,
        },
      ],
    },
    {
      id: 'routine-kitchen',
      name: 'KITCHEN',
      items: [
        {
          id: 'routine-kitchen-overall',
          name: 'Overall',
          agentComments:
            'Flooring, walls and ceiling appear intact. Oven and stove top appear clean. Rangehood operation requires follow-up.',
        },
      ],
    },
  ],
  photos: [],
};

const exitReport: ReportData = {
  id: 'exit-pdf-regression-test',
  status: 'draft',
  details: {
    reportType: 'Exit',
    formName: 'Exit Condition Report',
    actNotice: '',
    companyName: 'ProInspect',
    companyAddress: '19 Bonnard Crescent Ashby WA 6065',
    companyPhone: '(08) 9306 9668',
    companyEmail: 'info@proinspect.systems',
    companyWebsite: 'https://proinspect.systems',
    propertyAddress: '26 Merlin Way, Wattle Grove WA 6107',
    inspectingAgent: 'Exit Regression Test',
    inspectionDate: '2026-09-27',
    tenancyStartDate: '2025-09-01',
    tenants: 'Exit Tenant',
    tenantReceivedDate: '',
    reportReturnDate: '',
    paintingPremisesExternalDate: '2025-01-15',
    paintingPremisesInternalDate: '2025-02-10',
    floorcoveringsLaidDate: '2024-08-12',
    floorcoveringsCleanedDate: '2026-09-26',
    additionalComments:
      'Exit inspection completed. Items requiring cleaning, repair or further assessment are recorded in the condition table and photographs.',
    agentSignName: 'Exit Regression Test',
    agentSignDate: '2026-09-27',
    disclaimerText:
      'This exit condition report records visible conditions observed at the end-of-tenancy inspection and should be read with the photographs and commentary.',
  },
  areas: [
    {
      id: 'exit-exterior',
      name: 'EXTERIOR FRONT',
      items: Array.from({ length: 12 }, (_, index) => ({
        id: `exit-exterior-${index + 1}`,
        name: index === 0 ? 'External Walls' : `Exterior item ${index + 1}`,
        clean: index % 4 !== 0,
        undamaged: index % 5 !== 0,
        working: true,
        agentComments:
          index === 5
            ? longComment
            : `Exit condition observation ${index + 1}. Visible condition recorded at the time of inspection.`,
      })),
    },
    {
      id: 'exit-kitchen',
      name: 'KITCHEN',
      items: Array.from({ length: 16 }, (_, index) => ({
        id: `exit-kitchen-${index + 1}`,
        name: `Kitchen item ${index + 1}`,
        clean: index % 3 !== 0,
        undamaged: index % 6 !== 0,
        working: index % 7 !== 0,
        agentComments:
          `Kitchen exit commentary ${index + 1}. Cleaning and condition observations remain contained within the deterministic table geometry.`,
      })),
    },
  ],
  photos: [],
};

report.areas[0].items[0].maintenanceRequired = true;
report.areas[0].items[0].maintenanceCommentary =
  'Door closer is not consistently latching. Engage a general maintenance contractor to adjust the closer and confirm secure operation.';
report.photos = [
  {
    id: 'entry-maintenance-photo',
    name: 'Entry door closer maintenance evidence',
    areaName: report.areas[0].name,
    itemId: report.areas[0].items[0].id,
    itemName: report.areas[0].items[0].name,
    photoIndex: 1,
    dataUrl: LANDSCAPE_JPEG,
  },
];

await verifyPdf('Entry', report, 6, 10_000);
await verifyPdf('Routine', routineReport, 3, 4_000);
await verifyPdf('Exit', exitReport, 4);

const photoGalleryReport = structuredClone(routineReport);
photoGalleryReport.id = 'photo-gallery-regression-test';
photoGalleryReport.details.formName = 'Routine Inspection Report';
photoGalleryReport.details.inspectingAgent = 'Photo Gallery Regression Test';
photoGalleryReport.details.agentSignName = 'Photo Gallery Regression Test';
photoGalleryReport.photos = Array.from({ length: 13 }, (_, index) => {
  const area = index % 2 === 0 ? photoGalleryReport.areas[0] : photoGalleryReport.areas[1];
  return {
    id: `photo-${index + 1}`,
    name: `${area.name}: Overall (photo ${index + 1})`,
    areaName: area.name,
    photoIndex: Math.floor(index / 2) + 1,
    isCover: index === 0,
    dataUrl: index % 3 === 0 ? PORTRAIT_JPEG : LANDSCAPE_JPEG,
  };
});
if (validateReportStructure(photoGalleryReport).length !== 0) {
  throw new Error('Image-bearing photo gallery fixture failed structural validation.');
}
await verifyPdf('PhotoGalleryImages', photoGalleryReport, 5, 12_000);

const customWasteReport = createBlankReport('Custom', {
  id: 'waste-regression-property',
  address: 'Waste Management Test Building, Perth WA 6000',
});
customWasteReport.details.formName = 'Waste Management Report';
customWasteReport.details.inspectingAgent = 'ProInspect Test Inspector';
customWasteReport.details.agentSignName = 'ProInspect Test Inspector';
customWasteReport.areas = Array.from({ length: 10 }, (_, areaIndex) => ({
  id: `waste-area-${areaIndex + 1}`,
  name: areaIndex === 0 ? 'Garbage Rooms' : `Waste Section ${areaIndex + 1}`,
  items: Array.from({ length: areaIndex === 0 ? 11 : 1 }, (_, itemIndex) => ({
    id: `waste-item-${areaIndex + 1}-${itemIndex + 1}`,
    name: areaIndex === 0
      ? `Garbage room matter ${itemIndex + 1}`
      : `Waste section ${areaIndex + 1} matter`,
    agentComments: itemIndex === 4 && areaIndex === 0
      ? extremelyLongComment
      : `Waste Management commentary for section ${areaIndex + 1}, item ${itemIndex + 1}.`,
    activityDate: '2026-10-14',
    activityParty: 'Legacy responsible party - must not display',
    status: 'Legacy status - must not display',
    dueDate: '2026-11-01',
  })),
}));
customWasteReport.photos = [
  ...Array.from({ length: 28 }, (_, index) => ({
    id: `waste-linked-photo-${index + 1}`,
    name: `Garbage room photo ${index + 1}`,
    areaName: 'Garbage Rooms',
    itemId: 'waste-item-1-8',
    itemName: 'Garbage room matter 8',
    photoIndex: index + 1,
    dataUrl: index % 2 ? PORTRAIT_JPEG : LANDSCAPE_JPEG,
  })),
  {
    id: 'waste-category-photo',
    name: 'Garbage room overview',
    areaName: 'Garbage Rooms',
    photoIndex: 1,
    dataUrl: LANDSCAPE_JPEG,
  },
];
if (validateReportStructure(customWasteReport).length > 0) {
  throw new Error('Custom Waste Management report failed structure validation.');
}
const customPreviewBlocks = buildCustomReportPreviewPages(customWasteReport).flat();
const firstSectionTitles = customPreviewBlocks
  .filter((block) => block.areaName === 'Garbage Rooms' && !block.continuation)
  .map((block) => block.itemName);
if (!Array.from({ length: 11 }, (_, i) => `Garbage room matter ${i + 1}`)
  .every((name) => firstSectionTitles.includes(name))) {
  throw new Error('Custom preview truncated one or more items after the fourth entry.');
}
if (!customPreviewBlocks.some((block) => block.areaName === 'Waste Section 10')) {
  throw new Error('Custom preview truncated sections after the eighth entry.');
}
const previewPhotoIds = customPreviewBlocks.flatMap((block) => block.photos.map((photo) => photo.id));
if (
  previewPhotoIds.length !== customWasteReport.photos.length ||
  new Set(previewPhotoIds).size !== customWasteReport.photos.length
) {
  throw new Error('Custom preview lost or duplicated item-linked/category-level photos.');
}
const customHtml = renderToStaticMarkup(createElement(ExtendedReportDocument, { report: customWasteReport }));
for (const expected of ['Garbage room matter 1', 'Garbage room matter 11', 'Waste Section 10']) {
  if (!customHtml.includes(expected)) {
    throw new Error(`Custom preview HTML omits "${expected}".`);
  }
}
if (customHtml.includes('Legacy responsible party - must not display') ||
    customHtml.includes('Legacy status - must not display')) {
  throw new Error('Custom Report preview exposed obsolete responsibility/status columns.');
}
const dropCandidateFiles = [
  new File(['jpeg'], 'garbage-room.JPG', { type: 'image/jpeg' }),
  new File(['webp'], 'bins.WEBP', { type: '' }),
  new File(['pdf'], 'not-a-photo.pdf', { type: 'application/pdf' }),
  new File(['text'], 'fake-photo.jpg', { type: 'text/plain' }),
  new File(['png'], 'recycling.png', { type: 'image/png' }),
];
const selectedDropImages = imageFilesFromList(dropCandidateFiles);
if (
  selectedDropImages.length !== 3 ||
  selectedDropImages[0] !== dropCandidateFiles[0] ||
  selectedDropImages[1] !== dropCandidateFiles[1] ||
  selectedDropImages[2] !== dropCandidateFiles[4] ||
  imageFilesFromList(null).length !== 0
) {
  throw new Error('Custom Report drag-and-drop photo file selection regression detected.');
}

const customEditorHtml = renderToStaticMarkup(createElement(ExtendedReportEditor, {
  details: customWasteReport.details,
  areas: customWasteReport.areas,
  photos: customWasteReport.photos,
  onChangeDetails: () => {},
  onChangeAreas: () => {},
  onChangePhotos: () => {},
  onUploadPhotos: async () => {},
}));
if (
  !customEditorHtml.includes('data-photo-drop-area="waste-area-1"') ||
  !customEditorHtml.includes('data-photo-drop-item="waste-item-1-1"') ||
  !customEditorHtml.includes('Drag and drop photographs anywhere on this item')
) {
  throw new Error('Custom Report whole-item/section photo drop target regression detected.');
}
console.log('Custom Report photo drop targets and image filtering regression check passed.');
const desktopHeicFiles = [
  new File(['test'], 'IMG_4092.HEIC', { type: '' }),
  new File(['test'], 'IMG_4093.heif', { type: 'application/octet-stream' }),
  new File(['test'], 'photo.heics', { type: 'image/heic-sequence' }),
  new File(['test'], 'photo.heifs', { type: 'image/heif-sequence' }),
  new File(['test'], 'camera-image', { type: 'image/x-heic' }),
];
if (desktopHeicFiles.some((file) => !isHeicImageFile(file) || !isReportImageFile(file))) {
  throw new Error('HEIC/HEIF file selection regression: native or missing MIME type not accepted.');
}
if (!imageFilesFromList(desktopHeicFiles).every((file, index) => file === desktopHeicFiles[index])) {
  throw new Error('HEIC/HEIF drag-and-drop ordering regression detected.');
}
if (
  !isReportImageFile(new File(['jpeg'], 'photo.jpg', { type: '' })) ||
  isHeicImageFile(new File(['jpeg'], 'photo.jpg', { type: 'image/jpeg' })) ||
  isReportImageFile(new File(['pdf'], 'document.pdf', { type: 'application/pdf' })) ||
  !['.heic', '.heif', 'image/heic', 'image/heif'].every((part) => REPORT_IMAGE_ACCEPT.includes(part))
) {
  throw new Error('Report photo picker acceptance regression detected.');
}
console.log('HEIC/HEIF picker, drag-and-drop and MIME detection regression checks passed.');



await verifyPdf('CustomWasteManagement', customWasteReport, 7, 10_000);

for (const template of REPORT_TEMPLATES.filter((item) => !['Entry', 'Routine', 'Exit', 'KeyReceipt'].includes(item.type))) {
  const extended = createBlankReport(template.type, {
    id: `property-${template.type}`,
    address: '19 Bonnard Crescent Ashby WA 6065',
  });
  extended.details.inspectingAgent = 'Catalogue Regression Test';
  extended.details.clientName = 'ProInspect Test Client';
  extended.details.referenceNumber = `TEST-${template.type}`;
  extended.details.additionalComments = 'Catalogue regression test summary.';
  extended.details.agentSignName = 'Catalogue Regression Test';
  extended.areas = extended.areas.slice(0, 4).map((area, areaIndex) => ({
    ...area,
    items: [
      {
        ...(area.items[0] || {}),
        id: area.items[0]?.id || `fixture-${template.type}-${areaIndex}-1`,
        name: area.items[0]?.name || 'Overall',
        clean: template.family === 'condition' ? areaIndex % 3 !== 0 : undefined,
        undamaged: template.family === 'condition' ? true : undefined,
        working: template.family === 'condition' ? true : undefined,
        agentComments:
          `Representative ${template.shortLabel} observation for ${area.name}. The deterministic renderer must preserve wrapping, page geometry and ProInspect branding.`,
        activityParty: ['inspection', 'maintenance', 'operations', 'event'].includes(template.family)
          ? 'ProInspect / Assigned Contractor'
          : undefined,
        status: ['inspection', 'maintenance', 'operations', 'event'].includes(template.family)
          ? 'In Progress'
          : undefined,
        dueDate: ['inspection', 'maintenance', 'operations', 'event'].includes(template.family)
          ? '2026-10-15'
          : undefined,
      },
      {
        id: `extra-${template.type}-${areaIndex}`,
        name: 'Follow-up observation',
        clean: template.family === 'condition' ? true : undefined,
        undamaged: template.family === 'condition' ? areaIndex % 2 === 0 : undefined,
        working: template.family === 'condition' ? true : undefined,
        agentComments: 'Additional report finding included to exercise the reusable template family.',
      },
    ],
  }));

  await verifyPdf(template.type, extended, template.family === 'condition' ? 4 : 3, 3_500);
}

const customReport = createBlankReport('Custom', {
  id: 'custom-report-property',
  address: '19 Bonnard Crescent Ashby WA 6065',
});
customReport.details.formName = 'Special Property Investigation and Detailed Observation Report';
customReport.details.inspectingAgent = 'Custom Report Regression Test';
customReport.details.clientName = 'ProInspect Test Client';
customReport.details.referenceNumber = 'CUSTOM-001';
customReport.details.inspectionPurpose =
  'This manually entered report tests flexible custom content, including long narrative text and sections that do not rely on a predefined inspection checklist. '.repeat(8);
customReport.details.additionalComments =
  'Custom report summary with deliberately extended narrative to verify multi-page narrative pagination remains bounded within the A4 page geometry. '.repeat(14);
customReport.details.recommendedAction =
  'Recommended actions and next steps are entered directly by the report author and may contain detailed instructions. '.repeat(12);
customReport.details.actionRequired =
  'Actions required are recorded here and must remain readable even when the content extends over more than one page. '.repeat(10);
customReport.details.agentSignName = 'Custom Report Regression Test';
customReport.areas = [
  {
    id: 'custom-section-1',
    name: 'Background and Site Observations',
    items: [
      {
        id: 'custom-item-1',
        name: 'Detailed observation',
        agentComments: extremelyLongComment,
      },
      {
        id: 'custom-item-2',
        name: 'Additional manually entered matter',
        agentComments:
          'This custom narrative was entered directly and should use the same deterministic wrapping and continuation-page logic as the hardened report catalogue.',
      },
    ],
  },
  {
    id: 'custom-section-2',
    name: 'Special Findings and Supporting Information',
    items: Array.from({ length: 12 }, (_, index) => ({
      id: `custom-finding-${index + 1}`,
      name: `Custom finding ${index + 1}`,
      agentComments:
        `Manually entered custom finding ${index + 1}. The renderer must maintain stable table widths, wrapping, continuation headings and page margins.`,
    })),
  },
];
const customValidationIssues = validateReportForFinalization(customReport);
if (customValidationIssues.length !== 0) {
  throw new Error(
    `Valid Custom Report failed finalization validation: ${customValidationIssues.map((issue) => issue.message).join(' ')}`
  );
}
await verifyPdf('CustomLongContent', customReport, 6, 8_000);

const customLongTitle = structuredClone(customReport);
customLongTitle.id = 'custom-report-long-title';
customLongTitle.details.formName =
  'Special Property Investigation, Detailed Observation, Rectification Verification and Multi-Party Follow-Up Report for Complex Property Matters';
await verifyPdf('CustomLongTitle', customLongTitle, 6, 8_000);

const invalidCustomReport = structuredClone(customReport);
invalidCustomReport.details.formName = '';
if (!validateReportForFinalization(invalidCustomReport).some((issue) => issue.code === 'custom-report-title-required')) {
  throw new Error('Custom Report title validation regression detected.');
}

const keyReceipt = createBlankReport('KeyReceipt', {
  id: 'key-receipt-property',
  address: '19 Bonnard Crescent Ashby WA 6065',
});
keyReceipt.details.tenants = 'John Smith & Jane Smith';
keyReceipt.details.tenancyStartDate = '2026-09-28';
keyReceipt.details.inspectionDate = '2026-09-28';
keyReceipt.details.keyReceiptTime = '2:30 pm';
keyReceipt.details.inspectingAgent = 'ProInspect Key Handover';
keyReceipt.details.referenceNumber = 'TEN-KEY-001';
keyReceipt.details.additionalComments = 'Keys were handed directly to the tenants at commencement of the tenancy.';
keyReceipt.areas[0].items = [
  { id: 'key-front', name: 'Front Door Key', quantity: '2', identifier: 'Silver key - front entry', agentComments: '' },
  { id: 'key-security', name: 'Security / Screen Door Key', quantity: '2', identifier: 'Front security door', agentComments: '' },
  { id: 'key-rear', name: 'Rear Door Key', quantity: '1', identifier: '', agentComments: '' },
  { id: 'key-mailbox', name: 'Mailbox Key', quantity: '2', identifier: 'Mailbox 19', agentComments: '' },
  { id: 'key-remote', name: 'Garage Remote', quantity: '1', identifier: 'Black remote', agentComments: '' },
  { id: 'key-fob', name: 'Access Fob / Swipe Card', quantity: '2', identifier: 'Blue proximity fobs', agentComments: '' },
];
keyReceipt.photos = [
  {
    id: 'key-photo-front',
    name: 'Front door key set',
    areaName: keyReceipt.areas[0].name,
    itemId: 'key-front',
    itemName: 'Front Door Key',
    photoIndex: 1,
    dataUrl: LANDSCAPE_JPEG,
  },
  {
    id: 'key-photo-remote',
    name: 'Garage remote',
    areaName: keyReceipt.areas[0].name,
    itemId: 'key-remote',
    itemName: 'Garage Remote',
    photoIndex: 1,
    dataUrl: PORTRAIT_JPEG,
  },
];

const keyReceiptIssues = validateReportForFinalization(keyReceipt);
if (keyReceiptIssues.length !== 0) {
  throw new Error(`Valid Key Receipt failed finalization validation: ${keyReceiptIssues.map((issue) => issue.message).join(' ')}`);
}
await verifyPdf('KeyReceiptFilled', keyReceipt, 3, 7_000);

const keyReceiptStress = structuredClone(keyReceipt);
keyReceiptStress.id = 'key-receipt-stress';
keyReceiptStress.details.propertyAddress =
  'A deliberately long residential property address used to verify wrapping within the Key Receipt handover-details table, Perth WA 6000';
keyReceiptStress.details.tenants =
  'Alexandra Example-Smith & Christopher Example-Jones & Morgan Example-Williams';
keyReceiptStress.details.additionalComments =
  'This deliberately extended handover note verifies that the Key Receipt can continue safely while preserving the acknowledgement and tenant signature section. '.repeat(10);
keyReceiptStress.areas[0].items = Array.from({ length: 24 }, (_, index) => ({
  id: `key-stress-${index + 1}`,
  name: index % 4 === 0
    ? `Access Device ${index + 1} with an intentionally long description to exercise table wrapping`
    : `Key / Access Device ${index + 1}`,
  quantity: String((index % 3) + 1),
  identifier:
    `Identifier / handover note ${index + 1}. This text is deliberately extended to verify deterministic row-height calculation and continuation-page table headings.`,
  agentComments: '',
}));
keyReceiptStress.photos = [];
await verifyPdf('KeyReceiptLongList', keyReceiptStress, 2, 6_000);

const invalidKeyReceipt = structuredClone(keyReceipt);
invalidKeyReceipt.areas[0].items[0].quantity = '';
const invalidKeyReceiptIssues = validateReportForFinalization(invalidKeyReceipt);
if (!invalidKeyReceiptIssues.some((issue) => issue.code === 'key-receipt-quantity-required')) {
  throw new Error('Key Receipt quantity validation regression detected.');
}

const unlinkedKeyReceiptPhoto = structuredClone(keyReceipt);
unlinkedKeyReceiptPhoto.photos[0].itemId = undefined;
unlinkedKeyReceiptPhoto.photos[0].itemName = undefined;
const unlinkedKeyReceiptIssues = validateReportForFinalization(unlinkedKeyReceiptPhoto);
if (!unlinkedKeyReceiptIssues.some((issue) => issue.code === 'key-receipt-photo-item-required')) {
  throw new Error('Key Receipt photo-to-item validation regression detected.');
}

const buildingDaily = createBlankReport('BuildingManagementDaily', {
  id: 'bm-daily-property',
  address: '15-17 Freeman Loop, North Fremantle WA',
});
buildingDaily.details.buildingName = 'Meridian';
buildingDaily.details.strataPlan = 'Strata Plan 69776';
buildingDaily.details.clientName = 'Council of Owners';
buildingDaily.details.inspectingAgent = 'Building Manager Regression Test';
buildingDaily.details.agentSignName = 'Building Manager Regression Test';
buildingDaily.details.buildingSummary = 'Daily building-management activities completed and recorded by category.';
buildingDaily.areas[0].items = [
  {
    id: 'bm-daily-maintenance-1',
    name: 'Fire stairwell light sensor',
    activityTime: '09:15 am',
    activityParty: 'Electrical contractor',
    agentComments: 'Investigated the light sensor in the fire stairwell and completed fault finding to determine why the light was not activating.',
    actionComments: 'Replacement sensor recommended. Contractor to confirm parts availability and return date.',
  },
  {
    id: 'bm-daily-maintenance-2',
    name: 'Roof waterproofing preparation',
    activityTime: '11:30 am',
    activityParty: 'Roofing contractor',
    agentComments: longComment,
    actionComments: 'Testing completed. Product compatibility and next-stage works are to be confirmed before commencement.',
  },
];
buildingDaily.areas[6].items = [
  {
    id: 'bm-daily-waste-1',
    name: 'Waste and recycling service',
    activityTime: '02:00 pm',
    activityParty: 'Building Manager',
    agentComments: 'Collected bins, cleaned recycling and general waste bins with degreaser, and returned clean bins to the designated storage and carousel locations.',
    actionComments: 'No further action required.',
  },
];
await verifyPdf('BuildingManagementDailyFilled', buildingDaily, 4, 6_000);

const buildingMonthly = createBlankReport('BuildingManagementMonthly', {
  id: 'bm-monthly-property',
  address: '15-17 Freeman Loop, North Fremantle WA',
});
buildingMonthly.details.buildingName = 'Meridian';
buildingMonthly.details.strataPlan = 'Strata Plan 69776';
buildingMonthly.details.reportingPeriod = 'April 2026';
buildingMonthly.details.clientName = 'Council of Owners';
buildingMonthly.details.inspectingAgent = 'Building Manager Regression Test';
buildingMonthly.details.agentSignName = 'Building Manager Regression Test';
buildingMonthly.details.buildingSummary = 'Monthly building-management activity summary covering maintenance, security, cleaning, grounds, resident movements, inductions, waste, other matters, leave plans and issues.';
buildingMonthly.details.coverPhotoUrl = PORTRAIT_JPEG;
buildingMonthly.details.coverPhotoStorageKey = 'regression/building-monthly-cover.jpg';
buildingMonthly.areas[0].items = Array.from({ length: 14 }, (_, index) => ({
  id: `bm-monthly-maintenance-${index + 1}`,
  name: index % 2 === 0 ? 'Roof waterproofing works' : 'Electrical / services attendance',
  activityDate: `2026-04-${String(Math.min(30, index + 1)).padStart(2, '0')}`,
  activityParty: index % 2 === 0 ? 'ASR' : 'Rescom Electrical',
  agentComments:
    index === 6
      ? longComment
      : `Monthly building-management activity ${index + 1}. Contractor attendance, inspection and works were recorded for the reporting period.`,
  actionComments:
    index % 3 === 0
      ? 'Follow-up required. Building Manager to monitor progress and confirm completion.'
      : 'Completed / no further action recorded.',
}));
buildingMonthly.areas[1].items = [
  {
    id: 'bm-monthly-security-1',
    name: 'Apartment access programming',
    activityDate: '2026-04-15',
    activityParty: 'Apartment 404',
    agentComments: 'Programmed one remote and one swipe access credential.',
    actionComments: 'Completed.',
  },
];
buildingMonthly.areas[6].items = Array.from({ length: 18 }, (_, index) => ({
  id: `bm-monthly-waste-${index + 1}`,
  name: index % 2 === 0 ? 'General waste' : 'Recycling / FOGO',
  activityDate: `2026-04-${String(Math.min(30, index + 1)).padStart(2, '0')}`,
  activityParty: 'Building Manager',
  agentComments: 'Bins collected, washed and returned; waste streams consolidated and collection areas maintained.',
  actionComments: 'Routine service completed.',
}));
buildingMonthly.photos = [
  {
    id: 'bm-monthly-photo-1',
    name: 'Roof waterproofing evidence 1',
    areaName: buildingMonthly.areas[0].name,
    itemId: 'bm-monthly-maintenance-1',
    itemName: buildingMonthly.areas[0].items[0].name,
    photoIndex: 1,
    dataUrl: LANDSCAPE_JPEG,
  },
  {
    id: 'bm-monthly-photo-2',
    name: 'Roof waterproofing evidence 2',
    areaName: buildingMonthly.areas[0].name,
    itemId: 'bm-monthly-maintenance-1',
    itemName: buildingMonthly.areas[0].items[0].name,
    photoIndex: 2,
    dataUrl: PORTRAIT_JPEG,
  },
  {
    id: 'bm-monthly-photo-3',
    name: 'Electrical attendance evidence',
    areaName: buildingMonthly.areas[0].name,
    itemId: 'bm-monthly-maintenance-2',
    itemName: buildingMonthly.areas[0].items[1].name,
    photoIndex: 1,
    dataUrl: LANDSCAPE_JPEG,
  },
  {
    id: 'bm-monthly-photo-4',
    name: 'Access programming evidence',
    areaName: buildingMonthly.areas[1].name,
    itemId: 'bm-monthly-security-1',
    itemName: buildingMonthly.areas[1].items[0].name,
    photoIndex: 1,
    dataUrl: PORTRAIT_JPEG,
  },
  {
    id: 'bm-monthly-category-photo',
    name: 'Category overview evidence',
    areaName: buildingMonthly.areas[1].name,
    photoIndex: 2,
    dataUrl: LANDSCAPE_JPEG,
  },
];

const maintenanceArea = buildingMonthly.areas[0];
const securityArea = buildingMonthly.areas[1];
const maintenanceAreaNameBeforeRename = maintenanceArea.name;
const securityAreaNameBeforeRename = securityArea.name;
maintenanceArea.name = 'Maintenance & Contractor Works';
securityArea.name = 'Security, Access & Resident Support';
const maintenanceItemIds = new Set(maintenanceArea.items.map((item) => item.id));
const securityItemIds = new Set(securityArea.items.map((item) => item.id));
buildingMonthly.photos = buildingMonthly.photos.map((photo) =>
  (photo.itemId && maintenanceItemIds.has(photo.itemId)) || photo.areaName === maintenanceAreaNameBeforeRename
    ? { ...photo, areaName: maintenanceArea.name }
    : (photo.itemId && securityItemIds.has(photo.itemId)) || photo.areaName === securityAreaNameBeforeRename
    ? { ...photo, areaName: securityArea.name }
    : photo
);
[buildingMonthly.areas[0], buildingMonthly.areas[1]] = [buildingMonthly.areas[1], buildingMonthly.areas[0]];

if (validateReportForFinalization(buildingMonthly).length !== 0) {
  throw new Error('Renamed/reordered Building Manager categories failed finalization validation.');
}
await verifyPdf('BuildingManagementMonthlyFilled', buildingMonthly, 6, 10_000);

const updatedBusinessManagement = createBlankReport('UpdatedBusinessManagement', {
  id: 'updated-business-management-property',
  address: '88 Harbour View Parade, Perth WA 6000',
});
const expectedUpdatedBusinessCategories = [
  'Maintenance & Assets',
  'Building Operations',
  'Security & Access',
  'Residents & Occupancy',
  'Compliance & Safety',
  'Management & Administration',
];
if (
  updatedBusinessManagement.areas.map((area) => area.name).join('|') !==
  expectedUpdatedBusinessCategories.join('|')
) {
  throw new Error('Updated Business Management default category structure regression detected.');
}
updatedBusinessManagement.details.buildingName = 'Harbour View';
updatedBusinessManagement.details.strataPlan = 'Scheme 12345';
updatedBusinessManagement.details.reportingPeriod = 'September 2026';
updatedBusinessManagement.details.clientName = 'Council of Owners';
updatedBusinessManagement.details.inspectingAgent = 'ProInspect Building Manager';
updatedBusinessManagement.details.agentSignName = 'ProInspect Building Manager';
updatedBusinessManagement.details.buildingSummary =
  'Management operations remained stable during the reporting period, with maintenance, access, resident and compliance matters tracked through the streamlined activity register.';
updatedBusinessManagement.areas[0].items = [
  {
    id: 'ubm-maintenance-1',
    name: 'Roof membrane leak - Level 3',
    activityDate: '2026-09-14',
    activityParty: 'ABC Roofing',
    status: 'Awaiting Quote',
    dueDate: '2026-10-09',
    agentComments:
      'Water ingress was reported above Apartment 18. ABC Roofing attended, identified deterioration around a service penetration and completed temporary sealing. A quotation has been requested for permanent membrane repairs.',
    actionComments: '',
    maintenanceRequired: true,
    maintenanceCommentary:
      'Permanent waterproofing repair is required. Obtain and review the contractor quotation, then schedule the approved repair works.',
  },
  {
    id: 'ubm-maintenance-2',
    name: 'Lift preventative maintenance',
    activityDate: '2026-09-19',
    activityParty: 'Vertical Transport Services',
    status: 'Completed',
    dueDate: '2026-09-19',
    agentComments:
      'Scheduled preventative maintenance was completed. Service records were received and no further corrective work was identified at this attendance.',
    actionComments: '',
  },
];
updatedBusinessManagement.areas[2].items = [
  {
    id: 'ubm-security-1',
    name: 'Basement access reader fault',
    activityDate: '2026-09-22',
    activityParty: 'SecureTech',
    status: 'In Progress',
    dueDate: '2026-10-03',
    agentComments: longComment,
    actionComments: '',
  },
];
updatedBusinessManagement.areas[4].items = [
  {
    id: 'ubm-compliance-1',
    name: 'Annual fire systems inspection',
    activityDate: '2026-09-26',
    activityParty: 'Fire Compliance WA',
    status: 'Monitoring',
    dueDate: '2026-10-15',
    agentComments:
      'Annual fire systems inspection completed. Two minor follow-up items were identified and have been assigned for rectification and close-out.',
    actionComments: '',
  },
];
updatedBusinessManagement.photos = [
  {
    id: 'ubm-photo-1',
    name: 'Roof leak evidence',
    areaName: updatedBusinessManagement.areas[0].name,
    itemId: 'ubm-maintenance-1',
    itemName: 'Roof membrane leak - Level 3',
    photoIndex: 1,
    dataUrl: LANDSCAPE_JPEG,
  },
  {
    id: 'ubm-photo-2',
    name: 'Access reader evidence',
    areaName: updatedBusinessManagement.areas[2].name,
    itemId: 'ubm-security-1',
    itemName: 'Basement access reader fault',
    photoIndex: 1,
    dataUrl: PORTRAIT_JPEG,
  },
  {
    id: 'ubm-category-photo',
    name: 'Compliance overview',
    areaName: updatedBusinessManagement.areas[4].name,
    photoIndex: 1,
    dataUrl: LANDSCAPE_JPEG,
  },
];
const updatedBusinessIssues = validateReportForFinalization(updatedBusinessManagement);
if (updatedBusinessIssues.length !== 0) {
  throw new Error(
    `Valid Updated Business Management Report failed finalization validation: ${updatedBusinessIssues.map((issue) => issue.message).join(' ')}`
  );
}
await verifyPdf('UpdatedBusinessManagementFilled', updatedBusinessManagement, 6, 9_000);

const commonPropertyStress = createBlankReport('CommonProperty', {
  id: 'common-property-stress',
  address: 'A deliberately long common property address used to confirm that detail rows wrap correctly without crossing the report margin, Perth WA 6000',
});
commonPropertyStress.details.inspectingAgent = 'Catalogue Layout Stress Test';
commonPropertyStress.details.clientName =
  'A deliberately long client or council name that must wrap inside the metadata table rather than extend beyond the page boundary';
commonPropertyStress.details.agentSignName = 'Catalogue Layout Stress Test';
commonPropertyStress.areas = commonPropertyStress.areas.slice(0, 2);
commonPropertyStress.areas[0].items = [
  {
    id: 'common-stress-item',
    name: 'Common property observation with an intentionally extended item description to exercise item-column wrapping',
    agentComments: extremelyLongComment,
  },
];
await verifyPdf('CommonPropertyLongContent', commonPropertyStress, 4, 6_000);

const validBuildingManager = createBlankReport('BuildingManagementDaily', {
  id: 'validation-building-manager',
  address: '15-17 Freeman Loop, North Fremantle WA',
});
validBuildingManager.details.buildingName = 'Validation Building';
validBuildingManager.details.inspectingAgent = 'Validation User';
validBuildingManager.areas[0].items = [
  {
    id: 'validation-bm-item',
    name: 'Validation activity',
    activityTime: '10:00 am',
    agentComments: 'Validation activity completed.',
    actionComments: 'No further action.',
  },
];
validBuildingManager.photos = [
  {
    id: 'validation-photo',
    name: 'Validation evidence',
    areaName: validBuildingManager.areas[0].name,
    itemId: 'validation-bm-item',
    itemName: 'Validation activity',
    photoIndex: 1,
    storageKey: 'reports/validation/photos/validation-photo.jpg',
  },
];
if (validateReportForFinalization(validBuildingManager).length !== 0) {
  throw new Error('Valid Building Manager report failed finalization validation.');
}

const categoryPhotoBuildingManager = structuredClone(validBuildingManager);
categoryPhotoBuildingManager.photos[0].itemId = undefined;
categoryPhotoBuildingManager.photos[0].itemName = undefined;
if (validateReportForFinalization(categoryPhotoBuildingManager).length !== 0) {
  throw new Error('Valid Building Manager category-level photo failed finalization validation.');
}

const invalidBuildingManager = structuredClone(validBuildingManager);
invalidBuildingManager.photos[0].itemId = 'missing-building-manager-item';
const invalidIssues = validateReportForFinalization(invalidBuildingManager);
if (!invalidIssues.some((issue) => issue.code === 'photo-item-missing')) {
  throw new Error('Building Manager stale photo-link validation regression detected.');
}

const duplicateAreaReport = createBlankReport('VacantProperty', {
  id: 'validation-duplicate-area',
  address: '19 Bonnard Crescent Ashby WA 6065',
});
duplicateAreaReport.areas.push({
  ...duplicateAreaReport.areas[0],
  id: 'duplicate-area-id',
});
if (!validateReportStructure(duplicateAreaReport).some((issue) => issue.code === 'duplicate-area-name')) {
  throw new Error('Duplicate area-name validation regression detected.');
}

if (createBlankReport('Routine').schemaVersion !== CURRENT_REPORT_SCHEMA_VERSION) {
  throw new Error('New reports are not being stamped with the current report schema version.');
}

const legacyReport = structuredClone(routineReport);
delete legacyReport.schemaVersion;
const migratedLegacyReport = migrateReportData(legacyReport);
if (migratedLegacyReport.schemaVersion !== CURRENT_REPORT_SCHEMA_VERSION) {
  throw new Error('Legacy report schema migration regression detected.');
}
if (
  migratedLegacyReport.areas.some((area) =>
    area.items.some((item) => item.maintenanceRequired === undefined || item.maintenanceCommentary === undefined)
  )
) {
  throw new Error('Maintenance flag schema migration regression detected.');
}

let futureSchemaRejected = false;
try {
  migrateReportData({ ...routineReport, schemaVersion: CURRENT_REPORT_SCHEMA_VERSION + 1 });
} catch {
  futureSchemaRejected = true;
}
if (!futureSchemaRejected) {
  throw new Error('Future report schema versions must be rejected until the application supports them.');
}

const executedRoutine = structuredClone(routineReport);
executedRoutine.execution = {
  requestId: 'execution-regression-request',
  completedAt: '2026-10-02T09:30:00+08:00',
  parties: [
    {
      id: 'execution-client',
      name: 'Alex Client',
      email: 'alex@example.com',
      roleLabel: 'Client / Owner',
      signedName: 'Alex Client',
      commentary: 'Reviewed and accepted.',
      signedAt: '2026-10-02T09:10:00+08:00',
    },
    {
      id: 'execution-manager',
      name: 'Morgan Manager',
      email: 'manager@example.com',
      roleLabel: 'Property Manager / Countersigner',
      signedName: 'Morgan Manager',
      signedAt: '2026-10-02T09:30:00+08:00',
    },
  ],
  fields: [
    {
      fieldType: 'signature',
      label: 'Client signature',
      placementLabel: 'Client acknowledgement',
      pageNumber: 1,
      xPercent: 60,
      yPercent: 78,
      widthPercent: 28,
      partyId: 'execution-client',
    },
    {
      fieldType: 'text',
      label: 'Client instructions',
      placementLabel: 'Execution commentary',
      pageNumber: 1,
      xPercent: 10,
      yPercent: 78,
      widthPercent: 42,
      valueText: 'Proceed with the recommended maintenance items.',
      partyId: 'execution-client',
    },
    {
      label: 'Property manager countersignature',
      placementLabel: 'Management countersignature',
      partyId: 'execution-manager',
    },
  ],
};
await verifyPdf('RoutineFullyExecuted', executedRoutine, 4, 5_000);

console.log(`All ${REPORT_TEMPLATES.length} catalogue templates, rendering stress fixtures, schema migrations and report-integrity checks passed.`);

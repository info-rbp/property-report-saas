import jsPDF from 'jspdf';
import { PROINSPECT_COMPANY } from '../config/company';
import { getReportTemplate, isBuildingManagementTemplate, isKeyReceiptTemplate, ReportFieldDefinition, supportsMaintenanceRegister } from '../data/reportCatalogue';
import { formatAustralianDate, normalizeAreaName, splitTenantNames } from './reportFormatting';
import { maintenanceNarrative, maintenanceRegisterEntries } from './maintenanceRegister';
import { assertReportReadyForPdf } from './reportValidation';
import { InspectionArea, InspectionItem, ReportData, ReportPhoto, ReportType } from '../types/report';

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_X = 8;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN_X * 2);
const HEADER_Y = 7;
const BODY_TOP = 13;
const BODY_BOTTOM = 282;
const FOOTER_LINE_Y = 286.5;

const NAVY: [number, number, number] = [10, 37, 64];
const TEAL: [number, number, number] = [8, 145, 178];
const TEXT: [number, number, number] = [31, 41, 55];
const MUTED: [number, number, number] = [100, 116, 139];
const BORDER: [number, number, number] = [148, 163, 184];
const LIGHT_BORDER: [number, number, number] = [203, 213, 225];
const LIGHT_FILL: [number, number, number] = [248, 250, 252];
const SECTION_FILL: [number, number, number] = [241, 245, 249];
const RED: [number, number, number] = [185, 28, 28];
const BLUE: [number, number, number] = [29, 78, 216];

const ENTRY_COLUMN_WIDTHS = [34, 7, 7, 7, 78, 14, 47] as const;
const EXIT_COLUMN_WIDTHS = [42, 8, 8, 8, 128] as const;
const ROW_FONT_SIZE = 6.4;
const ROW_LINE_HEIGHT = 2.55;
const CELL_PAD = 1.15;

interface PdfImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

interface ItemFragment {
  nameLines: string[];
  agentLines: string[];
  tenantLines: string[];
  first: boolean;
}

function pdfSafeText(input: string): string {
  return input
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u2022/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '?');
}

function value(value: string | undefined | null): string {
  return pdfSafeText(value || '').trim();
}

function setFont(pdf: jsPDF, size: number, style: 'normal' | 'bold' | 'italic' | 'bolditalic' = 'normal') {
  pdf.setFont('helvetica', style);
  pdf.setFontSize(size);
}

function setTextColor(pdf: jsPDF, rgb: [number, number, number] = TEXT) {
  pdf.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function wrapText(pdf: jsPDF, text: string, width: number): string[] {
  const normalized = pdfSafeText(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const paragraphs = normalized.split('\n');
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    const wrapped = pdf.splitTextToSize(paragraph, Math.max(1, width)) as string[];
    lines.push(...wrapped);
  }
  return lines.length ? lines : [''];
}

function truncateTextToWidth(pdf: jsPDF, text: string, maxWidth: number): string {
  const normalized = value(text);
  if (!normalized || pdf.getTextWidth(normalized) <= maxWidth) return normalized;

  const ellipsis = '...';
  let low = 0;
  let high = normalized.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = normalized.slice(0, mid).trimEnd() + ellipsis;
    if (pdf.getTextWidth(candidate) <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return normalized.slice(0, low).trimEnd() + ellipsis;
}

function drawWrappedLines(
  pdf: jsPDF,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
  options?: { align?: 'left' | 'center' | 'right'; maxLines?: number }
) {
  const max = options?.maxLines ? lines.slice(0, options.maxLines) : lines;
  max.forEach((line, index) => {
    pdf.text(line, x, y + (index * lineHeight), { align: options?.align || 'left' });
  });
}

function drawBrand(pdf: jsPDF, x: number, y: number, scale = 1) {
  pdf.setDrawColor(...NAVY);
  pdf.setLineWidth(0.6 * scale);
  pdf.line(x, y + (5 * scale), x + (5 * scale), y + (1 * scale));
  pdf.line(x + (5 * scale), y + (1 * scale), x + (10 * scale), y + (5 * scale));
  pdf.rect(x + (2.1 * scale), y + (5 * scale), 5.8 * scale, 4.5 * scale);
  pdf.setDrawColor(...TEAL);
  pdf.circle(x + (9.2 * scale), y + (8.2 * scale), 3 * scale);
  pdf.line(x + (11.2 * scale), y + (10.4 * scale), x + (13.3 * scale), y + (12.5 * scale));

  setFont(pdf, 15 * scale, 'bold');
  setTextColor(pdf, NAVY);
  pdf.text('ProInspect', x + (16 * scale), y + (7.4 * scale));
  setFont(pdf, 4.8 * scale, 'bold');
  pdf.text('INSPECT. REPORT. PROTECT.', x + (16 * scale), y + (11.4 * scale));
}

function reportDisplayTitle(reportType: ReportType): string {
  if (reportType === 'Entry') return 'Residential Tenancy Entry Condition Report';
  if (reportType === 'Exit') return 'Residential Tenancy Exit Condition Report';
  return getReportTemplate(reportType).label;
}

function reportInstanceTitle(report: ReportData): string {
  if (report.details.reportType === 'Custom') {
    return value(report.details.formName) || getReportTemplate('Custom').label;
  }
  return reportDisplayTitle(report.details.reportType);
}

function reportRunningTitle(reportType: ReportType): string {
  if (reportType === 'Entry') return 'Entry Condition Report';
  if (reportType === 'Exit') return 'Exit Condition Report';
  return getReportTemplate(reportType).shortLabel;
}

function resolvedRunningTitle(report: ReportData): string {
  return report.details.reportType === 'Custom'
    ? reportInstanceTitle(report)
    : reportRunningTitle(report.details.reportType);
}

function drawRunningHeader(pdf: jsPDF, report: ReportData, rightTitle?: string) {
  setFont(pdf, 6.8, 'bold');
  setTextColor(pdf, TEXT);
  const gap = 8;
  const leftWidth = (CONTENT_WIDTH - gap) * 0.6;
  const rightWidth = CONTENT_WIDTH - gap - leftWidth;
  const address = truncateTextToWidth(
    pdf,
    value(report.details.propertyAddress) || 'Property address not recorded',
    leftWidth
  );
  const title = truncateTextToWidth(
    pdf,
    rightTitle || resolvedRunningTitle(report),
    rightWidth
  );
  pdf.text(address, MARGIN_X, HEADER_Y);
  pdf.text(title, PAGE_WIDTH - MARGIN_X, HEADER_Y, { align: 'right' });
  pdf.setDrawColor(...LIGHT_BORDER);
  pdf.setLineWidth(0.2);
  pdf.line(MARGIN_X, 9.2, PAGE_WIDTH - MARGIN_X, 9.2);
}

function drawFooter(pdf: jsPDF, pageNumber: number, totalPages: number, includeInitials: boolean) {
  pdf.setDrawColor(...LIGHT_BORDER);
  pdf.setLineWidth(0.2);
  pdf.line(MARGIN_X, FOOTER_LINE_Y, PAGE_WIDTH - MARGIN_X, FOOTER_LINE_Y);

  setFont(pdf, 5.8, 'bold');
  setTextColor(pdf, TEXT);
  if (includeInitials) {
    pdf.text("Tenant's Initial(s):", MARGIN_X, 291.1);
    setFont(pdf, 5.6, 'normal');
    pdf.text('1. ____   2. ____   3. ____   Date ____ / ____ / ____', MARGIN_X + 24, 291.1);
  }

  setFont(pdf, 6.2, 'bold');
  pdf.text(`${pageNumber} / ${totalPages}`, PAGE_WIDTH - MARGIN_X, 291.1, { align: 'right' });
}

function addContentPage(pdf: jsPDF, report: ReportData, title?: string): number {
  pdf.addPage('a4', 'portrait');
  drawRunningHeader(pdf, report, title);
  return BODY_TOP;
}

function drawBox(
  pdf: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  fill?: [number, number, number],
  border: [number, number, number] = LIGHT_BORDER
) {
  if (fill) {
    pdf.setFillColor(fill[0], fill[1], fill[2]);
    pdf.setDrawColor(border[0], border[1], border[2]);
    pdf.rect(x, y, width, height, 'FD');
  } else {
    pdf.setDrawColor(border[0], border[1], border[2]);
    pdf.rect(x, y, width, height);
  }
}

async function yieldToBrowser() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function fetchImageSource(source: string, label: string): Promise<Blob> {
  const response = await fetch(source, { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(`Unable to load ${label} for the PDF (${response.status}).`);
  }
  return response.blob();
}

async function canvasToJpeg(canvas: HTMLCanvasElement, quality: number, label: string): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error(`Unable to compress ${label} for the PDF.`)),
      'image/jpeg',
      quality
    );
  });
}

function inlineJpeg(source: string): PdfImage | null {
  const prefix = 'data:image/jpeg;base64,';
  if (!source.startsWith(prefix)) return null;

  try {
    const binary = atob(source.slice(prefix.length));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);

    if (bytes.length < 10 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

    const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.length) break;

      const marker = bytes[offset];
      offset += 1;
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 1 >= bytes.length) break;

      const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
      if (segmentLength < 2 || offset + segmentLength > bytes.length) break;

      if (startOfFrame.has(marker) && segmentLength >= 7) {
        const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
        const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
        if (width > 0 && height > 0) return { bytes, width, height };
        break;
      }
      offset += segmentLength;
    }
  } catch {
    return null;
  }

  return null;
}

async function prepareImageForPdf(
  source: string,
  label: string,
  maxDimension = 720,
  targetBytes = 45_000
): Promise<PdfImage> {
  const embedded = inlineJpeg(source);
  if (
    embedded &&
    embedded.bytes.length <= targetBytes &&
    Math.max(embedded.width, embedded.height) <= maxDimension
  ) {
    return embedded;
  }

  const sourceBlob = await fetchImageSource(source, label);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(sourceBlob);
  } catch {
    throw new Error(`Unable to decode ${label} for the PDF.`);
  }

  const initialScale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  let width = Math.max(1, Math.round(bitmap.width * initialScale));
  let height = Math.max(1, Math.round(bitmap.height * initialScale));

  const canvas = document.createElement('canvas');
  const renderBitmap = () => {
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error(`Unable to prepare ${label} for the PDF.`);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
  };

  try {
    renderBitmap();

    let output = await canvasToJpeg(canvas, 0.72, label);
    for (const quality of [0.64, 0.56, 0.48]) {
      if (output.size <= targetBytes) break;
      output = await canvasToJpeg(canvas, quality, label);
    }

    // Large reports can contain hundreds or thousands of photos. Keep each embedded gallery
    // image within a bounded byte budget so the final PDF remains uploadable on Cloudflare.
    // If JPEG quality alone is not enough, reduce pixel dimensions while preserving aspect ratio.
    let resizePasses = 0;
    while (output.size > targetBytes && Math.max(width, height) > 420 && resizePasses < 3) {
      const scale = Math.max(0.72, Math.min(0.9, Math.sqrt(targetBytes / output.size) * 0.95));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
      renderBitmap();
      output = await canvasToJpeg(canvas, 0.56, label);
      resizePasses += 1;
    }

    const bytes = new Uint8Array(await output.arrayBuffer());
    return { bytes, width, height };
  } finally {
    bitmap.close();
    canvas.width = 1;
    canvas.height = 1;
  }
}

function photoSource(photo: ReportPhoto): string {
  return photo.dataUrl || photo.url || '';
}

function containRect(imageWidth: number, imageHeight: number, boxWidth: number, boxHeight: number) {
  const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    width,
    height,
    xOffset: (boxWidth - width) / 2,
    yOffset: (boxHeight - height) / 2,
  };
}

function coverTitleLayout(pdf: jsPDF, title: string): { lines: string[]; fontSize: number; lineHeight: number } {
  const sizes = [18, 17, 16, 15, 14, 13, 12];
  for (const fontSize of sizes) {
    setFont(pdf, fontSize, 'bold');
    const lines = wrapText(pdf, title, 165);
    if (lines.length <= 3) {
      return { lines, fontSize, lineHeight: fontSize * 0.4 };
    }
  }

  setFont(pdf, 12, 'bold');
  const wrapped = wrapText(pdf, title, 165);
  const lines = wrapped.slice(0, 3);
  if (wrapped.length > 3) {
    lines[2] = truncateTextToWidth(pdf, wrapped.slice(2).join(' '), 165);
  }
  return { lines, fontSize: 12, lineHeight: 4.8 };
}

async function drawCoverPage(pdf: jsPDF, report: ReportData, onProgress?: (message: string) => void) {
  const details = report.details;
  drawBrand(pdf, 14, 15, 1);

  setFont(pdf, 7.2, 'bold');
  setTextColor(pdf, NAVY);
  pdf.text(value(details.companyName) || PROINSPECT_COMPANY.name, PAGE_WIDTH - 14, 17, { align: 'right' });
  setFont(pdf, 6.3, 'normal');
  setTextColor(pdf, TEXT);
  const companyLines = [
    value(details.companyAddress) || PROINSPECT_COMPANY.address,
    value(details.companyPhone) || PROINSPECT_COMPANY.phone,
    value(details.companyEmail) || PROINSPECT_COMPANY.email,
    (value(details.companyWebsite) || PROINSPECT_COMPANY.website).replace(/^https?:\/\//, ''),
  ].filter(Boolean);
  companyLines.forEach((line, index) => pdf.text(line, PAGE_WIDTH - 14, 21 + (index * 3.4), { align: 'right' }));

  const titleLayout = coverTitleLayout(pdf, reportInstanceTitle(report));
  setFont(pdf, titleLayout.fontSize, 'bold');
  setTextColor(pdf, TEXT);
  drawWrappedLines(pdf, titleLayout.lines, PAGE_WIDTH / 2, 58, titleLayout.lineHeight, { align: 'center' });

  const address = value(details.propertyAddress) || 'Property address not recorded';
  setFont(pdf, 10.5, 'bold');
  const addressLines = wrapText(pdf, address, 150);
  const addressY = 69 + Math.max(0, titleLayout.lines.length - 1) * 4.5;
  drawWrappedLines(pdf, addressLines, PAGE_WIDTH / 2, addressY, 4.6, { align: 'center' });

  const cover = details.coverPhotoUrl
    ? { source: details.coverPhotoUrl, label: 'cover photo' }
    : (() => {
        const selected = report.photos.find((photo) => photo.isCover) || report.photos[0];
        const source = selected ? photoSource(selected) : '';
        return source ? { source, label: selected?.name || 'cover photo' } : null;
      })();

  const imageBox = { x: 25, y: 91, width: 160, height: 105 };
  drawBox(pdf, imageBox.x, imageBox.y, imageBox.width, imageBox.height, LIGHT_FILL, LIGHT_BORDER);

  if (cover) {
    onProgress?.('Preparing cover photo...');
    const image = await prepareImageForPdf(cover.source, cover.label, 1400, 280_000);
    const fit = containRect(image.width, image.height, imageBox.width, imageBox.height);
    pdf.addImage(
      image.bytes,
      'JPEG',
      imageBox.x + fit.xOffset,
      imageBox.y + fit.yOffset,
      fit.width,
      fit.height,
      undefined,
      'FAST'
    );
  } else {
    setFont(pdf, 9, 'bold');
    setTextColor(pdf, MUTED);
    pdf.text('No cover photo selected', PAGE_WIDTH / 2, imageBox.y + (imageBox.height / 2), { align: 'center' });
  }

  setFont(pdf, 8.5, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text(`Report completed on ${formatAustralianDate(details.inspectionDate) || 'Not recorded'}`, PAGE_WIDTH / 2, 226, { align: 'center' });
  setFont(pdf, 8, 'normal');
  pdf.text(`Prepared by ${value(details.inspectingAgent) || 'Not recorded'}`, PAGE_WIDTH / 2, 232, { align: 'center' });

  pdf.setDrawColor(...LIGHT_BORDER);
  pdf.line(14, 275, PAGE_WIDTH - 14, 275);
  setFont(pdf, 5.8, 'bold');
  setTextColor(pdf, NAVY);
  pdf.text(value(details.companyName) || PROINSPECT_COMPANY.name, 14, 280);
  setFont(pdf, 5.2, 'normal');
  pdf.text('INSPECT. REPORT. PROTECT.', 36, 280);
}

function drawNumberedList(
  pdf: jsPDF,
  items: string[],
  x: number,
  y: number,
  width: number,
  fontSize = 6.2,
  lineHeight = 2.65,
  itemGap = 0.85
): number {
  setFont(pdf, fontSize, 'normal');
  setTextColor(pdf, TEXT);
  let cursor = y;
  items.forEach((item, index) => {
    const prefix = `${index + 1}.`;
    setFont(pdf, fontSize, 'bold');
    pdf.text(prefix, x, cursor);
    setFont(pdf, fontSize, 'normal');
    const lines = wrapText(pdf, item, width - 7);
    drawWrappedLines(pdf, lines, x + 7, cursor, lineHeight);
    cursor += Math.max(1, lines.length) * lineHeight + itemGap;
  });
  return cursor;
}

function drawTenancyDetailRow(pdf: jsPDF, y: number, label: string, content: string): number {
  const h = 8;
  drawBox(pdf, MARGIN_X, y, 46, h, SECTION_FILL, LIGHT_BORDER);
  drawBox(pdf, MARGIN_X + 46, y, CONTENT_WIDTH - 46, h, undefined, LIGHT_BORDER);
  setFont(pdf, 6.7, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text(label, MARGIN_X + 1.5, y + 5.1);
  setFont(pdf, 6.7, 'normal');
  pdf.text(content, MARGIN_X + 48, y + 5.1);
  return y + h;
}

function drawStatutoryPage(pdf: jsPDF, report: ReportData) {
  addContentPage(pdf, report, 'Property Condition Report');

  setFont(pdf, 5.8, 'bold');
  setTextColor(pdf, TEXT);
  drawBox(pdf, MARGIN_X, 13, 78, 12, LIGHT_FILL, LIGHT_BORDER);
  pdf.text('Government of Western Australia', MARGIN_X + 2, 17);
  setFont(pdf, 4.8, 'normal');
  pdf.text('Department of Local Government, Industry Regulation and Safety', MARGIN_X + 2, 20.1);
  pdf.text('Consumer Protection', MARGIN_X + 2, 23);

  setFont(pdf, 11, 'bold');
  pdf.text('FORM 1', PAGE_WIDTH - MARGIN_X, 16, { align: 'right' });
  setFont(pdf, 8.5, 'bold');
  pdf.text('Property Condition Report', PAGE_WIDTH - MARGIN_X, 20.5, { align: 'right' });
  setFont(pdf, 5.2, 'bold');
  pdf.text('RESIDENTIAL TENANCIES ACT 1987 (WA) Section 27C(6)', PAGE_WIDTH - MARGIN_X, 24, { align: 'right' });

  let y = 29;
  setFont(pdf, 7.2, 'bold');
  pdf.text('HOW TO COMPLETE THIS FORM', MARGIN_X, y);
  y += 4.2;

  y = drawNumberedList(pdf, [
    'Before the tenancy begins, the lessor or the property manager should inspect the residential premises and record the condition of the premises by indicating whether the particular room item is clean, undamaged and working by placing "Y" (YES) or "N" (NO) in the appropriate column. Where necessary, comments should be included in the report.',
    'Two copies of the report, which has been filled out and signed by the lessor or the property manager, must be given to the tenant within 7 days of the tenant moving into the premises.',
    'As soon as possible after the tenant receives the property condition report, the tenant should inspect the residential premises and complete the tenant section on both copies of the report. The tenant indicates agreement or disagreement with the condition indicated by the lessor or the property manager by placing "Y" (YES) or "N" (NO) in the appropriate column and by making any appropriate comments on the form.',
    'The tenant must return one copy of the completed property condition report to the lessor or the property manager within 7 days after receiving it. The tenant should keep the second copy of the property condition report.',
    'If photographs or video recordings are taken at the time the property inspection is carried out, it is recommended that all photographs or video recordings are signed and dated by all parties. Photographs and/or video recordings are not a substitute for accurate written descriptions of the condition of the property.',
    'As soon as practicable, and in any event within 14 days after the termination of the tenancy agreement, the lessor or the property manager should complete a property condition report indicating the condition of the premises at the end of the tenancy. This should be done in the presence of the tenant unless the tenant has been given a reasonable opportunity to be present and has not attended the inspection.',
  ], MARGIN_X, y, CONTENT_WIDTH, 6.2, 2.65, 0.85);

  y += 1.8;
  setFont(pdf, 7.2, 'bold');
  pdf.text('IMPORTANT NOTES ABOUT THIS PROPERTY CONDITION REPORT', MARGIN_X, y);
  y += 4.2;

  y = drawNumberedList(pdf, [
    'This property condition report is an important record of the condition of the residential premises when the tenancy begins. It may be used as evidence of the state of repair or general condition of the premises at the commencement of the tenancy if there is a dispute, particularly about the return of the security bond money and any damage to the premises. It is important to complete the property condition report accurately.',
    'A property condition report must be filled out whether or not a security bond is paid.',
    'At the end of the tenancy the premises must be inspected and the condition of the premises at that time will be compared to that stated in the original property condition report.',
    'A tenant is not responsible for fair wear and tear to the premises. Fair wear and tear is a general term for anything that occurs through ordinary use such as the carpet becoming worn in frequently used areas. Wilful and intentional damage, or damage caused by negligence, is not fair wear and tear.',
    'If you do not have enough space on the report, attach a separate sheet. All attachments should be signed and dated by all of the parties to the residential tenancy agreement.',
    'Information about the rights and responsibilities of lessors and tenants may be obtained from Consumer Protection on 1300 30 40 54 or at www.consumerprotection.wa.gov.au.',
  ], MARGIN_X, y, CONTENT_WIDTH, 6.2, 2.65, 0.85);

  y += 1.8;
  drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, 11.5, LIGHT_FILL, LIGHT_BORDER);
  setFont(pdf, 6, 'normal');
  setTextColor(pdf, TEXT);
  const info = wrapText(
    pdf,
    'For further information about tenancy rights, refer to the Residential Tenancies Act 1987 or contact Consumer Protection on 1300 304 054 or www.consumerprotection.wa.gov.au. For Translating and Interpreting Services telephone TIS on 13 14 50.',
    CONTENT_WIDTH - 4
  );
  drawWrappedLines(pdf, info, MARGIN_X + 2, y + 3.4, 2.5);
  y += 14;

  setFont(pdf, 7.1, 'bold');
  drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, 7.5, SECTION_FILL, BORDER);
  pdf.text('TENANCY DETAILS', MARGIN_X + 1.5, y + 4.9);
  y += 7.5;

  const details = report.details;
  y = drawTenancyDetailRow(pdf, y, 'Property Address:', value(details.propertyAddress));
  y = drawTenancyDetailRow(pdf, y, 'Inspecting Agent:', value(details.inspectingAgent));
  y = drawTenancyDetailRow(pdf, y, 'Inspection Date:', formatAustralianDate(details.inspectionDate));
  y = drawTenancyDetailRow(pdf, y, 'Tenancy Start Date:', formatAustralianDate(details.tenancyStartDate));
  y = drawTenancyDetailRow(pdf, y, 'Tenant/s:', value(details.tenants));
  y = drawTenancyDetailRow(pdf, y, 'Tenant Received Date:', formatAustralianDate(details.tenantReceivedDate));
  y = drawTenancyDetailRow(pdf, y, 'Report Return Date:', formatAustralianDate(details.reportReturnDate));

  if (y > BODY_BOTTOM) {
    throw new Error('Form 1 statutory page content exceeds the available A4 page height.');
  }
}

function entryColumnPositions() {
  const positions: number[] = [MARGIN_X];
  ENTRY_COLUMN_WIDTHS.forEach((width) => positions.push(positions[positions.length - 1] + width));
  return positions;
}

function drawConditionTopHeader(pdf: jsPDF, y: number): number {
  const x = entryColumnPositions();
  const h = 11.3;
  drawBox(pdf, x[0], y, x[5] - x[0], h, LIGHT_FILL, BORDER);
  drawBox(pdf, x[5], y, x[7] - x[5], h, LIGHT_FILL, BORDER);

  setFont(pdf, 6.5, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text('Agent section', (x[0] + x[5]) / 2, y + 3.2, { align: 'center' });
  pdf.text('Tenant section', (x[5] + x[7]) / 2, y + 3.2, { align: 'center' });

  setFont(pdf, 4.7, 'normal');
  const agent = wrapText(
    pdf,
    "Each item has a 'clean', 'undamaged' and 'working' column. Mark each column that applies and record any necessary comments.",
    (x[5] - x[0]) - 4
  );
  const tenant = wrapText(
    pdf,
    "If you disagree with the agent's report, record your comment here and note anything that seems unsafe or may be an injury risk.",
    (x[7] - x[5]) - 4
  );
  drawWrappedLines(pdf, agent, (x[0] + x[5]) / 2, y + 6, 1.9, { align: 'center', maxLines: 3 });
  drawWrappedLines(pdf, tenant, (x[5] + x[7]) / 2, y + 6, 1.9, { align: 'center', maxLines: 3 });

  return y + h;
}

function drawAreaHeader(pdf: jsPDF, y: number, areaName: string, continuation: boolean): number {
  const x = entryColumnPositions();
  const h = 7.8;
  ENTRY_COLUMN_WIDTHS.forEach((width, index) => drawBox(pdf, x[index], y, width, h, SECTION_FILL, BORDER));

  setFont(pdf, 6.1, 'bold');
  setTextColor(pdf, TEXT);
  const name = continuation ? `${areaName} (CONTINUED)` : areaName;
  const areaLines = wrapText(pdf, name.toUpperCase(), ENTRY_COLUMN_WIDTHS[0] - 2);
  drawWrappedLines(pdf, areaLines, x[0] + 1, y + 2.8, 2.1, { maxLines: 2 });

  const labels = ['Cln', 'Udg', 'Wkg'];
  labels.forEach((label, i) => {
    pdf.text(label, x[i + 1] + (ENTRY_COLUMN_WIDTHS[i + 1] / 2), y + 4.6, { align: 'center' });
  });

  pdf.text('Agent comments', x[4] + (ENTRY_COLUMN_WIDTHS[4] / 2), y + 2.8, { align: 'center' });
  setFont(pdf, 4.6, 'normal');
  pdf.text('Cln = Clean, Udg = Undamaged, Wkg = Working', x[4] + (ENTRY_COLUMN_WIDTHS[4] / 2), y + 5.7, { align: 'center' });

  setFont(pdf, 5.1, 'bold');
  pdf.text('Tenant', x[5] + (ENTRY_COLUMN_WIDTHS[5] / 2), y + 2.7, { align: 'center' });
  pdf.text('agrees', x[5] + (ENTRY_COLUMN_WIDTHS[5] / 2), y + 5.4, { align: 'center' });
  pdf.text('Tenant comments', x[6] + (ENTRY_COLUMN_WIDTHS[6] / 2), y + 4.2, { align: 'center' });

  return y + h;
}

function areaPhotoCount(report: ReportData, area: InspectionArea): number {
  const name = area.name.trim().toLowerCase();
  const photos = report.photos.filter((photo) => (photo.areaName || '').trim().toLowerCase() === name).length;
  return photos || area.overallPhotoCount || 0;
}

function drawOverallRow(pdf: jsPDF, y: number, count: number): number {
  const x = entryColumnPositions();
  const h = 5.6;
  ENTRY_COLUMN_WIDTHS.forEach((width, index) => drawBox(pdf, x[index], y, width, h, undefined, LIGHT_BORDER));
  setFont(pdf, 5.8, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text('Overall', x[0] + 1, y + 3.7);
  if (count > 0) {
    setTextColor(pdf, BLUE);
    setFont(pdf, 5.4, 'normal');
    pdf.text(`(${count} ${count === 1 ? 'photo' : 'photos'}, see photo gallery)`, x[4] + 1, y + 3.7);
  }
  return y + h;
}

function itemLines(pdf: jsPDF, item: InspectionItem) {
  setFont(pdf, ROW_FONT_SIZE, 'normal');
  return {
    name: wrapText(pdf, value(item.name), ENTRY_COLUMN_WIDTHS[0] - (CELL_PAD * 2)),
    agent: wrapText(pdf, value(item.agentComments), ENTRY_COLUMN_WIDTHS[4] - (CELL_PAD * 2)),
    tenant: wrapText(pdf, value(item.tenantComments), ENTRY_COLUMN_WIDTHS[6] - (CELL_PAD * 2)),
  };
}

function splitItemFragments(pdf: jsPDF, item: InspectionItem): ItemFragment[] {
  const lines = itemLines(pdf, item);
  const maxLinesPerFragment = 86;
  const count = Math.max(lines.name.length, lines.agent.length, lines.tenant.length);
  if (count <= maxLinesPerFragment) {
    return [{ nameLines: lines.name, agentLines: lines.agent, tenantLines: lines.tenant, first: true }];
  }

  const fragments: ItemFragment[] = [];
  for (let start = 0; start < count; start += maxLinesPerFragment) {
    const first = start === 0;
    fragments.push({
      nameLines: first
        ? lines.name.slice(start, start + maxLinesPerFragment)
        : [`${value(item.name)} (continued)`],
      agentLines: lines.agent.slice(start, start + maxLinesPerFragment),
      tenantLines: lines.tenant.slice(start, start + maxLinesPerFragment),
      first,
    });
  }
  return fragments;
}

function fragmentHeight(fragment: ItemFragment): number {
  const lineCount = Math.max(fragment.nameLines.length, fragment.agentLines.length, fragment.tenantLines.length, 1);
  return Math.max(5.2, (lineCount * ROW_LINE_HEIGHT) + (CELL_PAD * 2));
}

function drawBoolean(pdf: jsPDF, value: boolean | null | undefined, x: number, y: number) {
  if (value === null || value === undefined) return;
  setFont(pdf, 6.2, 'bold');
  setTextColor(pdf, value ? TEXT : RED);
  pdf.text(value ? 'Y' : 'N', x, y, { align: 'center' });
}

function drawItemRow(pdf: jsPDF, y: number, item: InspectionItem, fragment: ItemFragment): number {
  const x = entryColumnPositions();
  const h = fragmentHeight(fragment);
  ENTRY_COLUMN_WIDTHS.forEach((width, index) => drawBox(pdf, x[index], y, width, h, undefined, LIGHT_BORDER));

  setFont(pdf, ROW_FONT_SIZE, 'normal');
  setTextColor(pdf, TEXT);
  drawWrappedLines(pdf, fragment.nameLines, x[0] + CELL_PAD, y + 2.9, ROW_LINE_HEIGHT);
  drawWrappedLines(pdf, fragment.agentLines, x[4] + CELL_PAD, y + 2.9, ROW_LINE_HEIGHT);
  setFont(pdf, ROW_FONT_SIZE, 'italic');
  drawWrappedLines(pdf, fragment.tenantLines, x[6] + CELL_PAD, y + 2.9, ROW_LINE_HEIGHT);

  if (fragment.first) {
    const middleY = y + (h / 2) + 0.9;
    drawBoolean(pdf, item.clean, x[1] + (ENTRY_COLUMN_WIDTHS[1] / 2), middleY);
    drawBoolean(pdf, item.undamaged, x[2] + (ENTRY_COLUMN_WIDTHS[2] / 2), middleY);
    drawBoolean(pdf, item.working, x[3] + (ENTRY_COLUMN_WIDTHS[3] / 2), middleY);

    if (item.tenantAgrees !== null && item.tenantAgrees !== undefined) {
      setFont(pdf, 6.2, 'bold');
      setTextColor(pdf, item.tenantAgrees ? TEXT : RED);
      pdf.text(item.tenantAgrees ? 'Y' : 'N', x[5] + (ENTRY_COLUMN_WIDTHS[5] / 2), middleY, { align: 'center' });
    }
  }

  return y + h;
}

function startEntryConditionPage(pdf: jsPDF, report: ReportData): number {
  const y = addContentPage(pdf, report);
  return drawConditionTopHeader(pdf, y);
}

function drawEntryConditionPages(pdf: jsPDF, report: ReportData, onProgress?: (message: string) => void) {
  if (!report.areas.length) return;

  let y = startEntryConditionPage(pdf, report);
  let areaNumber = 0;

  report.areas.forEach((area) => {
    areaNumber += 1;
    onProgress?.(`Laying out inspection area ${areaNumber} of ${report.areas.length}...`);

    const count = areaPhotoCount(report, area);
    const fragments = area.items.flatMap((item) => splitItemFragments(pdf, item).map((fragment) => ({ item, fragment })));
    const firstRowHeight = fragments.length ? fragmentHeight(fragments[0].fragment) : 0;
    const initialNeed = 7.8 + (count > 0 ? 5.6 : 0) + firstRowHeight;

    if (y + initialNeed > BODY_BOTTOM) {
      y = startEntryConditionPage(pdf, report);
    }

    y = drawAreaHeader(pdf, y, area.name, false);
    if (count > 0) y = drawOverallRow(pdf, y, count);

    let continuation = false;
    fragments.forEach(({ item, fragment }) => {
      const h = fragmentHeight(fragment);
      if (y + h > BODY_BOTTOM) {
        y = startEntryConditionPage(pdf, report);
        y = drawAreaHeader(pdf, y, area.name, true);
        continuation = true;
      }
      y = drawItemRow(pdf, y, item, fragment);
    });

    if (!fragments.length && y > BODY_BOTTOM - 12) {
      y = startEntryConditionPage(pdf, report);
      y = drawAreaHeader(pdf, y, area.name, continuation);
    }
  });
}

function routineDetailRowHeight(pdf: jsPDF, label: string, content: string): number {
  const labelWidth = 52;
  const lineHeight = 2.7;
  setFont(pdf, 6.4, 'bold');
  const labelLines = wrapText(pdf, label, labelWidth - 3.2);
  setFont(pdf, 6.4, 'normal');
  const contentLines = wrapText(pdf, content || 'Not recorded', CONTENT_WIDTH - labelWidth - 3.6);
  return Math.max(7.2, Math.max(labelLines.length, contentLines.length, 1) * lineHeight + 3.2);
}

function drawRoutineDetailRow(pdf: jsPDF, y: number, label: string, content: string): number {
  const labelWidth = 52;
  const lineHeight = 2.7;
  const h = routineDetailRowHeight(pdf, label, content);
  setFont(pdf, 6.4, 'bold');
  const labelLines = wrapText(pdf, label, labelWidth - 3.2);
  setFont(pdf, 6.4, 'normal');
  const contentLines = wrapText(pdf, content || 'Not recorded', CONTENT_WIDTH - labelWidth - 3.6);

  drawBox(pdf, MARGIN_X, y, labelWidth, h, SECTION_FILL, LIGHT_BORDER);
  drawBox(pdf, MARGIN_X + labelWidth, y, CONTENT_WIDTH - labelWidth, h, undefined, LIGHT_BORDER);
  setFont(pdf, 6.4, 'bold');
  setTextColor(pdf, TEXT);
  drawWrappedLines(pdf, labelLines, MARGIN_X + 1.6, y + 3.8, lineHeight);
  setFont(pdf, 6.4, 'normal');
  drawWrappedLines(pdf, contentLines, MARGIN_X + labelWidth + 1.8, y + 3.8, lineHeight);
  return y + h;
}

function drawRoutinePageHeading(pdf: jsPDF, y: number, title: string): number {
  drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, 8, SECTION_FILL, BORDER);
  setFont(pdf, 7.5, 'bold');
  setTextColor(pdf, NAVY);
  pdf.text(title, MARGIN_X + 1.8, y + 5.1);
  return y + 10;
}

function drawRoutineAreaHeader(pdf: jsPDF, y: number, area: InspectionArea, photoCount: number, continuation: boolean): number {
  const h = 7.2;
  drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, h, SECTION_FILL, BORDER);
  setFont(pdf, 6.8, 'bold');
  setTextColor(pdf, TEXT);
  const title = continuation ? `${area.name.toUpperCase()} (CONTINUED)` : area.name.toUpperCase();
  const titleWidth = photoCount > 0 ? CONTENT_WIDTH - 67 : CONTENT_WIDTH - 3.2;
  pdf.text(truncateTextToWidth(pdf, title, titleWidth), MARGIN_X + 1.6, y + 4.6);
  if (photoCount > 0) {
    setFont(pdf, 5.9, 'bold');
    setTextColor(pdf, TEAL);
    pdf.text(
      `${photoCount} ${photoCount === 1 ? 'photo' : 'photos'} - see photo gallery`,
      PAGE_WIDTH - MARGIN_X - 1.6,
      y + 4.6,
      { align: 'right' }
    );
  }
  return y + h;
}

function drawRoutineColumnHeader(pdf: jsPDF, y: number): number {
  const itemWidth = 42;
  const h = 6.2;
  drawBox(pdf, MARGIN_X, y, itemWidth, h, LIGHT_FILL, BORDER);
  drawBox(pdf, MARGIN_X + itemWidth, y, CONTENT_WIDTH - itemWidth, h, LIGHT_FILL, BORDER);
  setFont(pdf, 6.2, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text('Item', MARGIN_X + 1.6, y + 4.1);
  pdf.text('Inspection findings', MARGIN_X + itemWidth + 1.6, y + 4.1);
  return y + h;
}

interface RoutineFindingFragment {
  itemLines: string[];
  commentLines: string[];
  first: boolean;
}

function splitRoutineFindingFragments(
  pdf: jsPDF,
  item: InspectionItem,
  emptyComment = 'No finding recorded.'
): RoutineFindingFragment[] {
  const itemWidth = 42;
  const commentWidth = CONTENT_WIDTH - itemWidth;
  const maxLinesPerFragment = 82;
  setFont(pdf, 6.7, 'normal');
  const itemLines = wrapText(pdf, value(item.name) || 'Overall', itemWidth - 3.2);
  const commentLines = wrapText(pdf, value(item.agentComments) || emptyComment, commentWidth - 3.2);
  const lineCount = Math.max(itemLines.length, commentLines.length, 1);
  const fragments: RoutineFindingFragment[] = [];

  for (let start = 0; start < lineCount; start += maxLinesPerFragment) {
    const first = start === 0;
    fragments.push({
      itemLines: first
        ? itemLines.slice(start, start + maxLinesPerFragment)
        : wrapText(pdf, `${value(item.name) || 'Overall'} (continued)`, itemWidth - 3.2),
      commentLines: commentLines.slice(start, start + maxLinesPerFragment),
      first,
    });
  }

  return fragments;
}

function routineFindingFragmentHeight(fragment: RoutineFindingFragment): number {
  const lineHeight = 2.7;
  return Math.max(7, Math.max(fragment.itemLines.length, fragment.commentLines.length, 1) * lineHeight + 3);
}

function drawRoutineFindingFragment(pdf: jsPDF, y: number, fragment: RoutineFindingFragment): number {
  const itemWidth = 42;
  const commentWidth = CONTENT_WIDTH - itemWidth;
  const lineHeight = 2.7;
  const h = routineFindingFragmentHeight(fragment);

  drawBox(pdf, MARGIN_X, y, itemWidth, h, undefined, LIGHT_BORDER);
  drawBox(pdf, MARGIN_X + itemWidth, y, commentWidth, h, undefined, LIGHT_BORDER);
  setFont(pdf, 6.6, 'bold');
  setTextColor(pdf, TEXT);
  drawWrappedLines(pdf, fragment.itemLines, MARGIN_X + 1.6, y + 3.8, lineHeight);
  setFont(pdf, 6.7, 'normal');
  drawWrappedLines(pdf, fragment.commentLines, MARGIN_X + itemWidth + 1.6, y + 3.8, lineHeight);
  return y + h;
}

function drawRoutineFindingsPages(pdf: jsPDF, report: ReportData, onProgress?: (message: string) => void) {
  let y = addContentPage(pdf, report, 'Routine Inspection Report');
  const details = report.details;

  y = drawRoutinePageHeading(pdf, y, 'Inspection Summary');
  const rows: Array<[string, string]> = [
    ['Inspection Completed On', formatAustralianDate(details.inspectionDate)],
    ['Property Manager / Inspector', value(details.inspectingAgent)],
    ['Lease Start Date', formatAustralianDate(details.tenancyStartDate)],
    ['Lease Expiry Date', formatAustralianDate(details.leaseExpiryDate)],
    ['Rent Review', formatAustralianDate(details.rentReviewDate)],
    ['Current Rental Amount', value(details.currentRentalAmount)],
    ['Tenant/s', value(details.tenants)],
  ];
  rows.forEach(([label, content]) => {
    const rowHeight = routineDetailRowHeight(pdf, label, content);
    if (y + rowHeight > BODY_BOTTOM) {
      y = addContentPage(pdf, report, 'Routine Inspection Report');
      y = drawRoutinePageHeading(pdf, y, 'Inspection Summary (continued)');
    }
    y = drawRoutineDetailRow(pdf, y, label, content);
  });

  const firstRoutineArea = report.areas[0];
  if (firstRoutineArea) {
    const firstRoutineItems = firstRoutineArea.items.length
      ? firstRoutineArea.items
      : [{ id: `${firstRoutineArea.id}-empty`, name: 'Overall', agentComments: 'No inspection finding recorded.' } as InspectionItem];
    const firstRoutineFragment = splitRoutineFindingFragments(
      pdf,
      firstRoutineItems[0],
      'No inspection finding recorded.'
    )[0];
    const firstRoutineHeight = firstRoutineFragment ? routineFindingFragmentHeight(firstRoutineFragment) : 7;
    const firstRoutineBlockHeight = 4 + 10 + 7.2 + 6.2 + firstRoutineHeight;
    if (y + firstRoutineBlockHeight > BODY_BOTTOM) {
      y = addContentPage(pdf, report, 'Routine Inspection Report');
    }
  }

  y += 4;
  y = drawRoutinePageHeading(pdf, y, 'Inspection Findings');

  report.areas.forEach((area, areaIndex) => {
    onProgress?.(`Laying out routine inspection area ${areaIndex + 1} of ${report.areas.length}...`);
    const count = areaPhotoCount(report, area);
    const items = area.items.length
      ? area.items
      : [{ id: `${area.id}-empty`, name: 'Overall', agentComments: 'No inspection finding recorded.' } as InspectionItem];
    const firstFragment = splitRoutineFindingFragments(pdf, items[0], 'No inspection finding recorded.')[0];
    const firstHeight = firstFragment ? routineFindingFragmentHeight(firstFragment) : 7;

    if (y + 7.2 + 6.2 + firstHeight > BODY_BOTTOM) {
      y = addContentPage(pdf, report, 'Routine Inspection Report');
      y = drawRoutinePageHeading(pdf, y, 'Inspection Findings (continued)');
    }

    y = drawRoutineAreaHeader(pdf, y, area, count, false);
    y = drawRoutineColumnHeader(pdf, y);

    items.forEach((item) => {
      const fragments = splitRoutineFindingFragments(pdf, item, 'No inspection finding recorded.');
      fragments.forEach((fragment, fragmentIndex) => {
        const h = routineFindingFragmentHeight(fragment);
        if (y + h > BODY_BOTTOM) {
          y = addContentPage(pdf, report, 'Routine Inspection Report');
          y = drawRoutinePageHeading(pdf, y, 'Inspection Findings (continued)');
          y = drawRoutineAreaHeader(pdf, y, area, count, true);
          y = drawRoutineColumnHeader(pdf, y);
        }
        y = drawRoutineFindingFragment(pdf, y, fragment);
        if (fragmentIndex < fragments.length - 1 && y > BODY_BOTTOM - 20) {
          y = addContentPage(pdf, report, 'Routine Inspection Report');
          y = drawRoutinePageHeading(pdf, y, 'Inspection Findings (continued)');
          y = drawRoutineAreaHeader(pdf, y, area, count, true);
          y = drawRoutineColumnHeader(pdf, y);
        }
      });
    });

    y += 2.5;
  });
}

function drawNarrativeSection(
  pdf: jsPDF,
  report: ReportData,
  y: number,
  title: string,
  text: string,
  accent: [number, number, number] = NAVY
): number {
  setFont(pdf, 6.8, 'normal');
  const allLines = wrapText(pdf, value(text) || 'No comments recorded.', CONTENT_WIDTH - 4);
  const lineHeight = 2.8;
  let offset = 0;
  let continuation = false;

  while (offset < allLines.length) {
    const minimumBlock = 22;
    if (y + minimumBlock > BODY_BOTTOM) {
      y = addContentPage(pdf, report, resolvedRunningTitle(report));
    }

    const available = BODY_BOTTOM - y;
    const maxLines = Math.max(1, Math.floor((available - 12) / lineHeight));
    const chunk = allLines.slice(offset, offset + maxLines);
    const boxHeight = Math.max(14, (chunk.length * lineHeight) + 5);

    drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, 7.2, SECTION_FILL, BORDER);
    setFont(pdf, 6.8, 'bold');
    setTextColor(pdf, accent);
    pdf.text(continuation ? `${title} (continued)` : title, MARGIN_X + 1.7, y + 4.7);
    y += 7.2;

    drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, boxHeight, undefined, LIGHT_BORDER);
    setFont(pdf, 6.8, 'normal');
    setTextColor(pdf, TEXT);
    drawWrappedLines(pdf, chunk, MARGIN_X + 2, y + 4, lineHeight);
    y += boxHeight + 3;

    offset += chunk.length;
    continuation = true;
    if (offset < allLines.length) {
      y = addContentPage(pdf, report, resolvedRunningTitle(report));
    }
  }

  return y;
}

function drawAgentSignoff(pdf: jsPDF, y: number, report: ReportData, heading: string): number {
  const details = report.details;
  drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, 8, SECTION_FILL, BORDER);
  setFont(pdf, 7, 'bold');
  setTextColor(pdf, NAVY);
  pdf.text(heading, MARGIN_X + 1.8, y + 5.1);
  y += 8;

  const widths = [65, 75, CONTENT_WIDTH - 140];
  const displayName = value(details.agentSignName) || value(details.inspectingAgent) || 'Not recorded';
  setFont(pdf, 7, 'normal');
  const nameLines = wrapText(pdf, displayName, widths[0] - 3.6);
  setFont(pdf, 8, 'italic');
  const signatureLines = wrapText(pdf, displayName === 'Not recorded' ? '' : displayName, widths[1] - 3.6);
  const h = Math.max(18, 9 + (Math.max(nameLines.length, signatureLines.length, 1) * 3));

  let x = MARGIN_X;
  widths.forEach((width) => {
    drawBox(pdf, x, y, width, h, undefined, LIGHT_BORDER);
    x += width;
  });
  setFont(pdf, 6, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text('Print Name:', MARGIN_X + 1.8, y + 4);
  setFont(pdf, 7, 'normal');
  drawWrappedLines(pdf, nameLines, MARGIN_X + 1.8, y + 9.5, 3);
  setFont(pdf, 6, 'bold');
  pdf.text('Signature:', MARGIN_X + 66.8, y + 4);
  setFont(pdf, 8, 'italic');
  drawWrappedLines(pdf, signatureLines, MARGIN_X + 66.8, y + 9.7, 3);
  setFont(pdf, 6, 'bold');
  pdf.text('Date:', MARGIN_X + 141.8, y + 4);
  setFont(pdf, 7, 'normal');
  pdf.text(formatAustralianDate(details.agentSignDate || details.inspectionDate) || 'Not recorded', MARGIN_X + 141.8, y + 9.5);

  return y + h + 4;
}

function drawDisclaimerSection(pdf: jsPDF, report: ReportData, y: number): number {
  setFont(pdf, 6, 'italic');
  const lines = wrapText(pdf, value(report.details.disclaimerText) || 'No disclaimer recorded.', CONTENT_WIDTH);
  const lineHeight = 2.5;
  let offset = 0;
  let continuation = false;

  while (offset < lines.length) {
    if (y + 12 > BODY_BOTTOM) {
      y = addContentPage(pdf, report, resolvedRunningTitle(report));
    }

    setFont(pdf, 6.2, 'bold');
    setTextColor(pdf, TEXT);
    pdf.text(continuation ? 'DISCLAIMER (CONTINUED):' : 'DISCLAIMER:', MARGIN_X, y + 1.5);

    const availableLines = Math.max(1, Math.floor((BODY_BOTTOM - y - 6) / lineHeight));
    const chunk = lines.slice(offset, offset + availableLines);
    setFont(pdf, 6, 'italic');
    setTextColor(pdf, MUTED);
    drawWrappedLines(pdf, chunk, MARGIN_X, y + 5.2, lineHeight);
    y += 6 + (chunk.length * lineHeight);
    offset += chunk.length;
    continuation = true;

    if (offset < lines.length) {
      y = addContentPage(pdf, report, resolvedRunningTitle(report));
    }
  }

  return y;
}

function drawRoutineClosingPages(pdf: jsPDF, report: ReportData) {
  let y = addContentPage(pdf, report, 'Routine Inspection Report');
  y = drawRoutinePageHeading(pdf, y, 'Inspection Summary & Actions');
  y = drawNarrativeSection(pdf, report, y, 'Agent Comments', report.details.additionalComments);
  y = drawNarrativeSection(pdf, report, y, 'Maintenance Comments', report.details.maintenanceComments || '', RED);

  if (y + 48 > BODY_BOTTOM) {
    y = addContentPage(pdf, report, 'Routine Inspection Report');
  }
  y = drawAgentSignoff(pdf, y, report, 'Prepared by / Report sign-off');
  y += 3;
  drawDisclaimerSection(pdf, report, y);
}

function detailFieldValue(report: ReportData, field: ReportFieldDefinition): string {
  const raw = report.details[field.key];
  const text = typeof raw === 'string' ? raw : '';
  const dateKeys = new Set([
    'inspectionDate',
    'tenancyStartDate',
    'leaseExpiryDate',
    'rentReviewDate',
    'completionDate',
    'incidentDate',
    'nextReviewDate',
    'agentSignDate',
  ]);
  return dateKeys.has(String(field.key)) ? formatAustralianDate(text) : value(text);
}

function drawGenericOverview(pdf: jsPDF, report: ReportData): number {
  const template = getReportTemplate(report.details.reportType);
  const runningTitle = resolvedRunningTitle(report);
  let y = addContentPage(pdf, report, runningTitle);
  y = drawRoutinePageHeading(pdf, y, template.summaryTitle);
  const addressValue = value(report.details.propertyAddress);
  const addressHeight = routineDetailRowHeight(pdf, 'Property / Site Address', addressValue);
  if (y + addressHeight > BODY_BOTTOM) y = addContentPage(pdf, report, runningTitle);
  y = drawRoutineDetailRow(pdf, y, 'Property / Site Address', addressValue);
  template.detailFields.forEach((field) => {
    const fieldValue = detailFieldValue(report, field);
    if (field.multiline) {
      if (y + 22 > BODY_BOTTOM) {
        y = addContentPage(pdf, report, runningTitle);
      }
      y = drawNarrativeSection(pdf, report, y, field.label, fieldValue || 'Not recorded.');
    } else {
      const rowHeight = routineDetailRowHeight(pdf, field.label, fieldValue);
      if (y + rowHeight > BODY_BOTTOM) {
        y = addContentPage(pdf, report, runningTitle);
      }
      y = drawRoutineDetailRow(pdf, y, field.label, fieldValue);
    }
  });
  return y;
}

function drawGenericActionTrackingRow(pdf: jsPDF, y: number, item: InspectionItem): number {
  const hasTracking = Boolean(value(item.activityParty) || value(item.status) || value(item.dueDate));
  if (!hasTracking) return y;

  const widths = [72, 54, CONTENT_WIDTH - 126];
  const values = [
    value(item.activityParty) || 'Not assigned',
    value(item.status) || 'Open',
    formatAustralianDate(item.dueDate) || value(item.dueDate) || 'No due date',
  ];
  const labels = ['Responsible Party', 'Status', 'Due Date'];
  const h = 10;

  let x = MARGIN_X;
  widths.forEach((width, index) => {
    drawBox(pdf, x, y, width, h, LIGHT_FILL, LIGHT_BORDER);
    setFont(pdf, 4.9, 'bold');
    setTextColor(pdf, MUTED);
    pdf.text(labels[index].toUpperCase(), x + 1.2, y + 3);
    setFont(pdf, 5.7, index === 1 ? 'bold' : 'normal');
    setTextColor(pdf, TEXT);
    pdf.text(truncateTextToWidth(pdf, values[index], width - 2.4), x + 1.2, y + 7.2);
    x += width;
  });
  return y + h;
}

function drawGenericFindingsPages(
  pdf: jsPDF,
  report: ReportData,
  startY: number,
  onProgress?: (message: string) => void
) {
  const template = getReportTemplate(report.details.reportType);
  const runningTitle = resolvedRunningTitle(report);
  let y = startY;

  const firstArea = report.areas[0];
  if (firstArea) {
    const firstItems = firstArea.items.length
      ? firstArea.items
      : [{ id: `${firstArea.id}-empty`, name: 'Overall', agentComments: 'No observation recorded.' } as InspectionItem];
    const firstFragment = splitRoutineFindingFragments(pdf, firstItems[0], 'No observation recorded.')[0];
    const firstHeight = firstFragment ? routineFindingFragmentHeight(firstFragment) : 7;
    const firstFindingsBlockHeight = 3 + 10 + 7.2 + 6.2 + firstHeight;
    if (y + firstFindingsBlockHeight > BODY_BOTTOM) {
      y = addContentPage(pdf, report, runningTitle);
    }
  } else if (y + 18 > BODY_BOTTOM) {
    y = addContentPage(pdf, report, runningTitle);
  }

  y += 3;
  y = drawRoutinePageHeading(pdf, y, template.findingsTitle);

  report.areas.forEach((area, areaIndex) => {
    onProgress?.(`Laying out ${template.shortLabel} area ${areaIndex + 1} of ${report.areas.length}...`);
    const count = areaPhotoCount(report, area);
    const items = area.items.length
      ? area.items
      : [{ id: `${area.id}-empty`, name: 'Overall', agentComments: 'No observation recorded.' } as InspectionItem];

    const firstFragment = splitRoutineFindingFragments(pdf, items[0], 'No observation recorded.')[0];
    const firstHeight = firstFragment ? routineFindingFragmentHeight(firstFragment) : 7;

    if (y + 7.2 + 6.2 + firstHeight > BODY_BOTTOM) {
      y = addContentPage(pdf, report, runningTitle);
      y = drawRoutinePageHeading(pdf, y, `${template.findingsTitle} (continued)`);
    }

    y = drawRoutineAreaHeader(pdf, y, area, count, false);
    y = drawRoutineColumnHeader(pdf, y);

    items.forEach((item) => {
      const fragments = splitRoutineFindingFragments(pdf, item, 'No observation recorded.');
      fragments.forEach((fragment) => {
        const height = routineFindingFragmentHeight(fragment);
        if (y + height > BODY_BOTTOM) {
          y = addContentPage(pdf, report, runningTitle);
          y = drawRoutinePageHeading(pdf, y, `${template.findingsTitle} (continued)`);
          y = drawRoutineAreaHeader(pdf, y, area, count, true);
          y = drawRoutineColumnHeader(pdf, y);
        }
        y = drawRoutineFindingFragment(pdf, y, fragment);
      });
      const hasTracking = Boolean(value(item.activityParty) || value(item.status) || value(item.dueDate));
      if (hasTracking) {
        if (y + 10 > BODY_BOTTOM) {
          y = addContentPage(pdf, report, runningTitle);
          y = drawRoutinePageHeading(pdf, y, `${template.findingsTitle} (continued)`);
          y = drawRoutineAreaHeader(pdf, y, area, count, true);
        }
        y = drawGenericActionTrackingRow(pdf, y, item);
      }
    });
    y += 2.5;
  });
}

function drawGenericConditionPages(pdf: jsPDF, report: ReportData, onProgress?: (message: string) => void) {
  const template = getReportTemplate(report.details.reportType);
  const runningTitle = resolvedRunningTitle(report);
  let y = addContentPage(pdf, report, runningTitle);

  report.areas.forEach((area, areaIndex) => {
    onProgress?.(`Laying out ${template.shortLabel} condition area ${areaIndex + 1} of ${report.areas.length}...`);
    const count = areaPhotoCount(report, area);
    const fragments = area.items.flatMap((item) =>
      exitItemFragments(pdf, item).map((fragment) => ({ item, fragment }))
    );
    const firstHeight = fragments.length ? exitFragmentHeight(fragments[0].fragment) : 7;
    if (y + 7.8 + (count > 0 ? 5.8 : 0) + firstHeight > BODY_BOTTOM) {
      y = addContentPage(pdf, report, runningTitle);
    }
    y = drawExitAreaHeader(pdf, y, area.name, false);
    if (count > 0) y = drawExitOverallRow(pdf, y, count);

    fragments.forEach(({ item, fragment }) => {
      const height = exitFragmentHeight(fragment);
      if (y + height > BODY_BOTTOM) {
        y = addContentPage(pdf, report, runningTitle);
        y = drawExitAreaHeader(pdf, y, area.name, true);
      }
      y = drawExitItemRow(pdf, y, item, fragment);
    });
  });
}

function drawGenericClosingPages(pdf: jsPDF, report: ReportData) {
  const template = getReportTemplate(report.details.reportType);
  const runningTitle = resolvedRunningTitle(report);
  let y = addContentPage(pdf, report, runningTitle);
  y = drawRoutinePageHeading(pdf, y, template.finalSectionTitle);

  const signoffKeys = new Set(['agentSignName', 'agentSignDate']);
  template.summaryFields.forEach((field) => {
    if (signoffKeys.has(String(field.key))) return;
    const fieldValue = detailFieldValue(report, field);
    if (field.multiline) {
      y = drawNarrativeSection(pdf, report, y, field.label, fieldValue || 'No comments recorded.');
    } else {
      const rowHeight = routineDetailRowHeight(pdf, field.label, fieldValue);
      if (y + rowHeight > BODY_BOTTOM) y = addContentPage(pdf, report, runningTitle);
      y = drawRoutineDetailRow(pdf, y, field.label, fieldValue);
    }
  });

  if (y + 48 > BODY_BOTTOM) y = addContentPage(pdf, report, runningTitle);
  y = drawAgentSignoff(pdf, y, report, 'Prepared by / Report sign-off');
  y += 3;
  drawDisclaimerSection(pdf, report, y);
}

async function drawCustomReportPages(
  pdf: jsPDF,
  report: ReportData,
  onProgress?: (message: string) => void
): Promise<void> {
  const runningTitle = resolvedRunningTitle(report);
  let y = drawGenericOverview(pdf, report);

  if (y + 24 > BODY_BOTTOM) y = addContentPage(pdf, report, runningTitle);
  y += 3;
  y = drawRoutinePageHeading(pdf, y, 'Report Content');

  for (let areaIndex = 0; areaIndex < report.areas.length; areaIndex++) {
    const area = report.areas[areaIndex];
    onProgress?.(`Laying out Custom Report section ${areaIndex + 1} of ${report.areas.length}...`);
    if (y + 27 > BODY_BOTTOM) {
      y = addContentPage(pdf, report, runningTitle);
      y = drawRoutinePageHeading(pdf, y, 'Report Content (continued)');
    }
    y = drawBuildingManagementCategoryHeader(pdf, y, area.name);

    if (!area.items.length) {
      if (y + 10 > BODY_BOTTOM) {
        y = addContentPage(pdf, report, runningTitle);
        y = drawBuildingManagementCategoryHeader(pdf, y, area.name, true);
      }
      drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, 8, undefined, LIGHT_BORDER);
      setFont(pdf, 6, 'italic');
      setTextColor(pdf, MUTED);
      pdf.text('No items recorded in this section.', MARGIN_X + 2, y + 5.1);
      y += 10;
    }

    for (let itemIndex = 0; itemIndex < area.items.length; itemIndex++) {
      const item = area.items[itemIndex];
      onProgress?.(`Rendering Custom Report item ${itemIndex + 1} of ${area.items.length} in "${area.name}"...`);
      setFont(pdf, 7.4, 'bold');
      const title = value(item.name) || 'Untitled item';
      const titleLines = wrapText(pdf, title, CONTENT_WIDTH - 3.6);
      const titleHeight = Math.max(9, titleLines.length * 3.3 + 4);
      setFont(pdf, 7, 'normal');
      const commentaryLines = wrapText(
        pdf,
        value(item.agentComments) || 'No commentary recorded.',
        CONTENT_WIDTH - 4
      );
      const lineHeight = 3;
      let offset = 0;
      let continuation = false;

      while (offset < commentaryLines.length) {
        if (y + titleHeight + 15 > BODY_BOTTOM) {
          y = addContentPage(pdf, report, runningTitle);
          y = drawBuildingManagementCategoryHeader(pdf, y, area.name, true);
        }

        drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, titleHeight, LIGHT_FILL, LIGHT_BORDER);
        setFont(pdf, 7.4, 'bold');
        setTextColor(pdf, NAVY);
        drawWrappedLines(pdf, continuation ? [...titleLines.slice(0, 1), '(continued)'] : titleLines, MARGIN_X + 1.8, y + 4.5, 3.3);
        y += titleHeight;

        const maxLines = Math.max(1, Math.floor((BODY_BOTTOM - y - 9) / lineHeight));
        const chunk = commentaryLines.slice(offset, offset + maxLines);
        const narrativeHeight = 7 + chunk.length * lineHeight;
        drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, narrativeHeight, undefined, LIGHT_BORDER);
        setFont(pdf, 5.3, 'bold');
        setTextColor(pdf, MUTED);
        pdf.text(continuation ? 'COMMENTARY (CONTINUED)' : 'COMMENTARY', MARGIN_X + 1.8, y + 3.5);
        setFont(pdf, 7, 'normal');
        setTextColor(pdf, TEXT);
        drawWrappedLines(pdf, chunk, MARGIN_X + 1.8, y + 7.2, lineHeight);
        y += narrativeHeight + 2;
        offset += chunk.length;
        continuation = true;
      }

      if (buildingManagementItemPhotos(report, item.id) > 0) {
        y = await drawBuildingManagementItemPhotoEvidence(pdf, report, area, item, y, onProgress);
      }
      y += 3;
    }

    if (buildingManagementCategoryPhotoList(report, area).length > 0) {
      y = await drawBuildingManagementCategoryPhotoEvidence(pdf, report, area, y, onProgress);
    }
    y += 3;
  }
}

function drawExtendedReportPages(pdf: jsPDF, report: ReportData, onProgress?: (message: string) => void) {
  const template = getReportTemplate(report.details.reportType);
  const overviewEnd = drawGenericOverview(pdf, report);
  if (template.family === 'condition') {
    drawGenericConditionPages(pdf, report, onProgress);
  } else {
    drawGenericFindingsPages(pdf, report, overviewEnd, onProgress);
  }
}

function isDailyBuildingManagementReport(type: ReportType): boolean {
  return type === 'BuildingManagementDaily';
}

const BUILDING_MANAGEMENT_WIDTHS = [40, 34, 60, 48, 12] as const;

function buildingManagementColumnPositions(): number[] {
  const positions: number[] = [MARGIN_X];
  BUILDING_MANAGEMENT_WIDTHS.forEach((width) => positions.push(positions[positions.length - 1] + width));
  return positions;
}

function drawBuildingManagementOverview(pdf: jsPDF, report: ReportData): number {
  const daily = isDailyBuildingManagementReport(report.details.reportType);
  const overviewTitle = getReportTemplate(report.details.reportType).summaryTitle;
  let y = addContentPage(pdf, report, resolvedRunningTitle(report));
  y = drawRoutinePageHeading(pdf, y, overviewTitle);

  const rows: Array<[string, string]> = [
    ['Building / Scheme Name', value(report.details.buildingName)],
    ['Strata Plan / Scheme Reference', value(report.details.strataPlan)],
    ['Building / Site Address', value(report.details.propertyAddress)],
    [daily ? 'Report Date' : 'Reporting Period', daily ? formatAustralianDate(report.details.inspectionDate) : value(report.details.reportingPeriod)],
    ...(!daily ? [['Report Issue Date', formatAustralianDate(report.details.inspectionDate)] as [string, string]] : []),
    ['Building Manager / Prepared By', value(report.details.inspectingAgent)],
    ['Client / Council / Principal', value(report.details.clientName)],
  ];

  rows.forEach(([label, content]) => {
    const rowHeight = routineDetailRowHeight(pdf, label, content);
    if (y + rowHeight > BODY_BOTTOM) {
      y = addContentPage(pdf, report, resolvedRunningTitle(report));
      y = drawRoutinePageHeading(pdf, y, `${overviewTitle} (continued)`);
    }
    y = drawRoutineDetailRow(pdf, y, label, content);
  });
  return y + 4;
}

function drawBuildingManagementCategoryHeader(
  pdf: jsPDF,
  y: number,
  category: string,
  continuation = false
): number {
  drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, 7.2, SECTION_FILL, BORDER);
  setFont(pdf, 6.9, 'bold');
  setTextColor(pdf, NAVY);
  const title = continuation ? `${category.toUpperCase()} (CONTINUED)` : category.toUpperCase();
  pdf.text(truncateTextToWidth(pdf, title, CONTENT_WIDTH - 3.2), MARGIN_X + 1.6, y + 4.7);
  return y + 7.2;
}

function drawBuildingManagementTableHeader(pdf: jsPDF, y: number, daily: boolean): number {
  const x = buildingManagementColumnPositions();
  const h = 9.6;
  BUILDING_MANAGEMENT_WIDTHS.forEach((width, index) => drawBox(pdf, x[index], y, width, h, LIGHT_FILL, BORDER));
  setFont(pdf, 5.4, 'bold');
  setTextColor(pdf, TEXT);
  const headings = [
    daily ? 'Time / Party' : 'Date / Party',
    'Reporting Item',
    daily ? 'Brief Summary of Activities Today' : 'Brief Summary of Activities within this period',
    'Actions',
    'Photos',
  ];
  headings.forEach((heading, index) => {
    const lines = wrapText(pdf, heading, BUILDING_MANAGEMENT_WIDTHS[index] - 2.4);
    drawWrappedLines(
      pdf,
      lines,
      x[index] + BUILDING_MANAGEMENT_WIDTHS[index] / 2,
      y + 3.2,
      2.1,
      { align: 'center', maxLines: 3 }
    );
  });
  return y + h;
}

function buildingManagementItemPhotoList(report: ReportData, itemId: string): ReportPhoto[] {
  return report.photos
    .filter((photo) => photo.itemId === itemId)
    .sort((a, b) => (a.photoIndex || 0) - (b.photoIndex || 0));
}

function buildingManagementItemPhotos(report: ReportData, itemId: string): number {
  return buildingManagementItemPhotoList(report, itemId).length;
}

function buildingManagementCategoryPhotoList(report: ReportData, area: InspectionArea): ReportPhoto[] {
  const areaKey = normalizeAreaName(area.name);
  return report.photos
    .filter((photo) => !photo.itemId && normalizeAreaName(photo.areaName) === areaKey)
    .sort((a, b) => (a.photoIndex || 0) - (b.photoIndex || 0));
}

function buildingManagementPeriodText(item: InspectionItem, daily: boolean): string {
  const when = daily
    ? value(item.activityTime)
    : formatAustralianDate(item.activityDate) || value(item.activityDate);
  const party = value(item.activityParty);
  return [when, party].filter(Boolean).join('\n');
}

function drawBuildingManagementPhotoEvidenceHeader(
  pdf: jsPDF,
  y: number,
  titleText: string,
  photoCount: number,
  continuation = false
): number {
  const h = 7.2;
  drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, h, LIGHT_FILL, LIGHT_BORDER);
  setFont(pdf, 6.3, 'bold');
  setTextColor(pdf, NAVY);
  const suffix = continuation ? ' (CONTINUED)' : '';
  const title = `PHOTO EVIDENCE - ${titleText || 'REPORTING ITEM'}${suffix}`;
  pdf.text(truncateTextToWidth(pdf, title, CONTENT_WIDTH - 38), MARGIN_X + 1.6, y + 4.6);
  setFont(pdf, 5.8, 'bold');
  setTextColor(pdf, TEAL);
  pdf.text(`${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}`, PAGE_WIDTH - MARGIN_X - 1.6, y + 4.6, { align: 'right' });
  return y + h + 2;
}

async function drawBuildingManagementItemPhotoEvidence(
  pdf: jsPDF,
  report: ReportData,
  area: InspectionArea,
  item: InspectionItem,
  startY: number,
  onProgress?: (message: string) => void
): Promise<number> {
  const photos = buildingManagementItemPhotoList(report, item.id);
  if (!photos.length) return startY;

  const template = getReportTemplate(report.details.reportType);
  const runningTitle = template.shortLabel;
  const columns = 3;
  const gapX = 3;
  const gapY = 2.5;
  const cellWidth = (CONTENT_WIDTH - (gapX * (columns - 1))) / columns;
  const captionHeight = 6;
  const imageHeight = 38;
  const cellHeight = captionHeight + imageHeight;
  let y = startY;
  let embedded = 0;

  const beginEvidenceBlock = (continuation: boolean) => {
    if (y + 7.2 + 2 + cellHeight > BODY_BOTTOM) {
      y = addContentPage(pdf, report, runningTitle);
      y = drawBuildingManagementCategoryHeader(pdf, y, area.name, true);
    }
    y = drawBuildingManagementPhotoEvidenceHeader(pdf, y, value(item.name) || 'REPORTING ITEM', photos.length, continuation);
  };

  beginEvidenceBlock(false);
  onProgress?.(`Rendering ${photos.length} photo${photos.length === 1 ? '' : 's'} for "${value(item.name) || 'reporting item'}"...`);

  for (let rowStart = 0; rowStart < photos.length; rowStart += columns) {
    if (y + cellHeight > BODY_BOTTOM) {
      y = addContentPage(pdf, report, runningTitle);
      y = drawBuildingManagementCategoryHeader(pdf, y, area.name, true);
      y = drawBuildingManagementPhotoEvidenceHeader(pdf, y, value(item.name) || 'REPORTING ITEM', photos.length, true);
    }

    const rowPhotos = photos.slice(rowStart, rowStart + columns);
    for (let column = 0; column < rowPhotos.length; column++) {
      const photo = rowPhotos[column];
      const x = MARGIN_X + (column * (cellWidth + gapX));
      drawBox(pdf, x, y, cellWidth, cellHeight, undefined, LIGHT_BORDER);

      setFont(pdf, 5.4, 'bold');
      setTextColor(pdf, TEXT);
      pdf.text(`Photo ${rowStart + column + 1} of ${photos.length}`, x + 1.2, y + 3.8);

      const source = photoSource(photo);
      if (!source) {
        throw new Error(`Photo "${photo.name || photo.id}" has no image source. The report was not finalised.`);
      }

      const image = await prepareImageForPdf(source, photo.name || `photo ${rowStart + column + 1}`, 720, 45_000);
      const fit = containRect(image.width, image.height, cellWidth - 1.6, imageHeight - 1.6);
      const imageY = y + captionHeight;
      pdf.addImage(
        image.bytes,
        'JPEG',
        x + 0.8 + fit.xOffset,
        imageY + 0.8 + fit.yOffset,
        fit.width,
        fit.height,
        undefined,
        'FAST'
      );

      embedded += 1;
      if (embedded % 4 === 0) await yieldToBrowser();
    }

    y += cellHeight + gapY;
  }

  if (embedded !== photos.length) {
    throw new Error(`Building Manager photo validation failed for "${value(item.name) || item.id}".`);
  }

  return y + 1;
}

async function drawBuildingManagementCategoryPhotoEvidence(
  pdf: jsPDF,
  report: ReportData,
  area: InspectionArea,
  startY: number,
  onProgress?: (message: string) => void
): Promise<number> {
  const photos = buildingManagementCategoryPhotoList(report, area);
  if (!photos.length) return startY;

  const template = getReportTemplate(report.details.reportType);
  const runningTitle = template.shortLabel;
  const columns = 3;
  const gapX = 3;
  const gapY = 2.5;
  const cellWidth = (CONTENT_WIDTH - (gapX * (columns - 1))) / columns;
  const captionHeight = 6;
  const imageHeight = 38;
  const cellHeight = captionHeight + imageHeight;
  let y = startY;
  let embedded = 0;

  const beginEvidenceBlock = (continuation: boolean) => {
    if (y + 7.2 + 2 + cellHeight > BODY_BOTTOM) {
      y = addContentPage(pdf, report, runningTitle);
      y = drawBuildingManagementCategoryHeader(pdf, y, area.name, true);
    }
    y = drawBuildingManagementPhotoEvidenceHeader(
      pdf,
      y,
      `${area.name || 'CATEGORY'} - CATEGORY-LEVEL`,
      photos.length,
      continuation
    );
  };

  beginEvidenceBlock(false);
  onProgress?.(`Rendering ${photos.length} category-level photo${photos.length === 1 ? '' : 's'} for "${area.name}"...`);

  for (let rowStart = 0; rowStart < photos.length; rowStart += columns) {
    if (y + cellHeight > BODY_BOTTOM) {
      y = addContentPage(pdf, report, runningTitle);
      y = drawBuildingManagementCategoryHeader(pdf, y, area.name, true);
      y = drawBuildingManagementPhotoEvidenceHeader(
        pdf,
        y,
        `${area.name || 'CATEGORY'} - CATEGORY-LEVEL`,
        photos.length,
        true
      );
    }

    const rowPhotos = photos.slice(rowStart, rowStart + columns);
    for (let column = 0; column < rowPhotos.length; column++) {
      const photo = rowPhotos[column];
      const x = MARGIN_X + (column * (cellWidth + gapX));
      drawBox(pdf, x, y, cellWidth, cellHeight, undefined, LIGHT_BORDER);

      setFont(pdf, 5.4, 'bold');
      setTextColor(pdf, TEXT);
      pdf.text(`Photo ${rowStart + column + 1} of ${photos.length}`, x + 1.2, y + 3.8);

      const source = photoSource(photo);
      if (!source) {
        throw new Error(`Photo "${photo.name || photo.id}" has no image source. The report was not finalised.`);
      }

      const image = await prepareImageForPdf(source, photo.name || `photo ${rowStart + column + 1}`, 720, 45_000);
      const fit = containRect(image.width, image.height, cellWidth - 1.6, imageHeight - 1.6);
      const imageY = y + captionHeight;
      pdf.addImage(
        image.bytes,
        'JPEG',
        x + 0.8 + fit.xOffset,
        imageY + 0.8 + fit.yOffset,
        fit.width,
        fit.height,
        undefined,
        'FAST'
      );

      embedded += 1;
      if (embedded % 4 === 0) await yieldToBrowser();
    }

    y += cellHeight + gapY;
  }

  return y + 1;
}

const UPDATED_BUSINESS_MANAGEMENT_WIDTHS = [24, 50, 42, 30, 36, 12] as const;

function updatedBusinessManagementColumnPositions(): number[] {
  const positions: number[] = [MARGIN_X];
  UPDATED_BUSINESS_MANAGEMENT_WIDTHS.forEach((width) => positions.push(positions[positions.length - 1] + width));
  return positions;
}

function drawUpdatedBusinessManagementTableHeader(pdf: jsPDF, y: number): number {
  const x = updatedBusinessManagementColumnPositions();
  const h = 8.8;
  const headings = ['Date', 'Item', 'Responsible Party', 'Status', 'Due Date', 'Photos'];
  UPDATED_BUSINESS_MANAGEMENT_WIDTHS.forEach((width, index) => drawBox(pdf, x[index], y, width, h, LIGHT_FILL, BORDER));
  setFont(pdf, 5.4, 'bold');
  setTextColor(pdf, TEXT);
  headings.forEach((heading, index) => {
    const lines = wrapText(pdf, heading, UPDATED_BUSINESS_MANAGEMENT_WIDTHS[index] - 2.2);
    drawWrappedLines(
      pdf,
      lines,
      x[index] + UPDATED_BUSINESS_MANAGEMENT_WIDTHS[index] / 2,
      y + 3.2,
      2.1,
      { align: 'center', maxLines: 2 }
    );
  });
  return y + h;
}

function drawUpdatedBusinessManagementItemMeta(
  pdf: jsPDF,
  report: ReportData,
  item: InspectionItem,
  y: number,
  continued = false
): number {
  const x = updatedBusinessManagementColumnPositions();
  setFont(pdf, 5.8, 'normal');
  const values = [
    formatAustralianDate(item.activityDate) || value(item.activityDate) || 'Not recorded',
    continued ? `${value(item.name) || 'Untitled item'} (continued)` : value(item.name) || 'Untitled item',
    value(item.activityParty) || 'Not assigned',
    value(item.status) || 'Open',
    formatAustralianDate(item.dueDate) || value(item.dueDate) || 'No due date',
    String(buildingManagementItemPhotos(report, item.id)),
  ];
  const wrapped = values.map((text, index) =>
    wrapText(pdf, text, UPDATED_BUSINESS_MANAGEMENT_WIDTHS[index] - 2.6)
  );
  const lineCount = Math.max(...wrapped.map((lines) => lines.length), 1);
  const h = Math.max(7.5, lineCount * 2.5 + 3);

  UPDATED_BUSINESS_MANAGEMENT_WIDTHS.forEach((width, index) => drawBox(pdf, x[index], y, width, h, undefined, LIGHT_BORDER));
  wrapped.forEach((lines, index) => {
    setFont(pdf, 5.8, index === 1 || index === 3 || index === 5 ? 'bold' : 'normal');
    setTextColor(pdf, index === 5 && buildingManagementItemPhotos(report, item.id) > 0 ? TEAL : TEXT);
    drawWrappedLines(
      pdf,
      lines,
      index === 5 ? x[index] + UPDATED_BUSINESS_MANAGEMENT_WIDTHS[index] / 2 : x[index] + 1.3,
      y + 3.4,
      2.5,
      index === 5 ? { align: 'center' } : undefined
    );
  });
  return y + h;
}

function drawUpdatedBusinessManagementDescriptionChunk(
  pdf: jsPDF,
  y: number,
  lines: string[],
  continued = false
): number {
  const h = Math.max(9, lines.length * 2.55 + 7);
  drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, h, undefined, LIGHT_BORDER);
  setFont(pdf, 5.3, 'bold');
  setTextColor(pdf, MUTED);
  pdf.text(continued ? 'DESCRIPTION / ACTION (CONTINUED)' : 'DESCRIPTION / ACTION', MARGIN_X + 1.5, y + 3.4);
  setFont(pdf, 5.9, 'normal');
  setTextColor(pdf, TEXT);
  drawWrappedLines(pdf, lines.length ? lines : ['No description / action recorded.'], MARGIN_X + 1.5, y + 6.5, 2.55);
  return y + h;
}

async function drawUpdatedBusinessManagementItem(
  pdf: jsPDF,
  report: ReportData,
  area: InspectionArea,
  item: InspectionItem,
  startY: number,
  onProgress?: (message: string) => void
): Promise<number> {
  const template = getReportTemplate(report.details.reportType);
  const runningTitle = template.shortLabel;
  const allLines = wrapText(
    pdf,
    value(item.agentComments) || 'No description / action recorded.',
    CONTENT_WIDTH - 3
  );
  let y = startY;
  let offset = 0;
  let continued = false;

  setFont(pdf, 5.8, 'normal');
  const metaValues = [
    formatAustralianDate(item.activityDate) || value(item.activityDate) || 'Not recorded',
    value(item.name) || 'Untitled item',
    value(item.activityParty) || 'Not assigned',
    value(item.status) || 'Open',
    formatAustralianDate(item.dueDate) || value(item.dueDate) || 'No due date',
    String(buildingManagementItemPhotos(report, item.id)),
  ];
  const metaHeight = Math.max(
    7.5,
    Math.max(
      ...metaValues.map((text, index) =>
        wrapText(pdf, text, UPDATED_BUSINESS_MANAGEMENT_WIDTHS[index] - 2.6).length
      ),
      1
    ) * 2.5 + 3
  );

  while (offset < allLines.length || (allLines.length === 0 && offset === 0)) {
    const minimumDescriptionHeight = 12;
    if (y + metaHeight + minimumDescriptionHeight > BODY_BOTTOM) {
      y = addContentPage(pdf, report, runningTitle);
      y = drawBuildingManagementCategoryHeader(pdf, y, area.name, true);
      y = drawUpdatedBusinessManagementTableHeader(pdf, y);
    }

    y = drawUpdatedBusinessManagementItemMeta(pdf, report, item, y, continued);
    const availableLines = Math.max(1, Math.floor((BODY_BOTTOM - y - 7) / 2.55));
    const chunk = allLines.slice(offset, offset + availableLines);
    y = drawUpdatedBusinessManagementDescriptionChunk(pdf, y, chunk, continued);
    offset += chunk.length || 1;

    if (offset < allLines.length) {
      y = addContentPage(pdf, report, runningTitle);
      y = drawBuildingManagementCategoryHeader(pdf, y, area.name, true);
      y = drawUpdatedBusinessManagementTableHeader(pdf, y);
      continued = true;
    }
  }

  if (buildingManagementItemPhotos(report, item.id) > 0) {
    y = await drawBuildingManagementItemPhotoEvidence(pdf, report, area, item, y, onProgress);
  }

  return y;
}

async function drawBuildingManagementActivityPages(
  pdf: jsPDF,
  report: ReportData,
  startY: number,
  onProgress?: (message: string) => void
) {
  const daily = isDailyBuildingManagementReport(report.details.reportType);
  const updatedLayout = report.details.reportType === 'UpdatedBusinessManagement';
  const inlinePhotos =
    report.details.reportType === 'BuildingManagementMonthly' || updatedLayout;
  const template = getReportTemplate(report.details.reportType);
  const runningTitle = template.shortLabel;
  const x = buildingManagementColumnPositions();
  const lineHeight = 2.55;
  let y = startY;

  if (y + 20 > BODY_BOTTOM) y = addContentPage(pdf, report, runningTitle);
  y = drawRoutinePageHeading(pdf, y, template.findingsTitle);

  for (let areaIndex = 0; areaIndex < report.areas.length; areaIndex++) {
    const area = report.areas[areaIndex];
    onProgress?.(`Laying out Building Manager category ${areaIndex + 1} of ${report.areas.length}...`);

    if (y + 20 > BODY_BOTTOM) y = addContentPage(pdf, report, runningTitle);
    y = drawBuildingManagementCategoryHeader(pdf, y, area.name);
    if (inlinePhotos && buildingManagementCategoryPhotoList(report, area).length > 0) {
      y = await drawBuildingManagementCategoryPhotoEvidence(pdf, report, area, y, onProgress);
    }

    if (updatedLayout) {
      y = drawUpdatedBusinessManagementTableHeader(pdf, y);

      if (!area.items.length) {
        const h = 9;
        if (y + h > BODY_BOTTOM) {
          y = addContentPage(pdf, report, runningTitle);
          y = drawBuildingManagementCategoryHeader(pdf, y, area.name, true);
          y = drawUpdatedBusinessManagementTableHeader(pdf, y);
        }
        drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, h, undefined, LIGHT_BORDER);
        setFont(pdf, 6, 'italic');
        setTextColor(pdf, MUTED);
        pdf.text('No items recorded in this category for the reporting period.', MARGIN_X + 2, y + 5.6);
        y += h + 2.5;
        continue;
      }

      for (let itemIndex = 0; itemIndex < area.items.length; itemIndex++) {
        y = await drawUpdatedBusinessManagementItem(pdf, report, area, area.items[itemIndex], y, onProgress);
        if (itemIndex < area.items.length - 1) {
          if (y + 18 > BODY_BOTTOM) {
            y = addContentPage(pdf, report, runningTitle);
            y = drawBuildingManagementCategoryHeader(pdf, y, area.name, true);
          }
          y = drawUpdatedBusinessManagementTableHeader(pdf, y);
        }
      }

      y += 2.5;
      continue;
    }

    y = drawBuildingManagementTableHeader(pdf, y, daily);

    if (!area.items.length) {
      const h = 9;
      if (y + h > BODY_BOTTOM) {
        y = addContentPage(pdf, report, runningTitle);
        y = drawBuildingManagementCategoryHeader(pdf, y, area.name, true);
        y = drawBuildingManagementTableHeader(pdf, y, daily);
      }
      drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, h, undefined, LIGHT_BORDER);
      setFont(pdf, 6, 'italic');
      setTextColor(pdf, MUTED);
      pdf.text('No activity recorded in this category for the reporting period.', MARGIN_X + 2, y + 5.6);
      y += h + 2.5;
      continue;
    }

    for (let itemIndex = 0; itemIndex < area.items.length; itemIndex++) {
      const item = area.items[itemIndex];
      setFont(pdf, 5.9, 'normal');
      const summaryLines = wrapText(pdf, value(item.agentComments) || 'No activity summary recorded.', BUILDING_MANAGEMENT_WIDTHS[2] - 2.6);
      const actionLines = wrapText(pdf, value(item.actionComments) || 'No further action recorded.', BUILDING_MANAGEMENT_WIDTHS[3] - 2.6);
      const periodLines = wrapText(pdf, buildingManagementPeriodText(item, daily) || 'Not recorded', BUILDING_MANAGEMENT_WIDTHS[0] - 2.6);
      const itemLines = wrapText(pdf, value(item.name) || 'Untitled reporting item', BUILDING_MANAGEMENT_WIDTHS[1] - 2.6);
      const totalContentLines = Math.max(
        summaryLines.length,
        actionLines.length,
        periodLines.length,
        itemLines.length,
        1
      );
      let offset = 0;
      let firstFragment = true;

      while (offset < totalContentLines) {
        let availableLines = Math.floor((BODY_BOTTOM - y - 3) / lineHeight);
        if (availableLines < 2) {
          y = addContentPage(pdf, report, runningTitle);
          y = drawBuildingManagementCategoryHeader(pdf, y, area.name, true);
          y = drawBuildingManagementTableHeader(pdf, y, daily);
          availableLines = Math.floor((BODY_BOTTOM - y - 3) / lineHeight);
        }

        const chunkSize = Math.max(1, Math.min(availableLines, totalContentLines - offset));
        const summaryChunk = summaryLines.slice(offset, offset + chunkSize);
        const actionChunk = actionLines.slice(offset, offset + chunkSize);
        const periodChunk = periodLines.slice(offset, offset + chunkSize);
        const itemChunk = itemLines.slice(offset, offset + chunkSize);
        const leftLines = periodChunk.length ? periodChunk : [''];
        const nameLines = itemChunk.length
          ? itemChunk
          : firstFragment
          ? ['Untitled reporting item']
          : wrapText(pdf, `${value(item.name) || 'Reporting item'} (continued)`, BUILDING_MANAGEMENT_WIDTHS[1] - 2.6);
        const rowLines = Math.max(leftLines.length, nameLines.length, summaryChunk.length, actionChunk.length, 1);
        const h = Math.max(7, rowLines * lineHeight + 3);

        if (y + h > BODY_BOTTOM) {
          y = addContentPage(pdf, report, runningTitle);
          y = drawBuildingManagementCategoryHeader(pdf, y, area.name, true);
          y = drawBuildingManagementTableHeader(pdf, y, daily);
          continue;
        }

        BUILDING_MANAGEMENT_WIDTHS.forEach((width, index) => drawBox(pdf, x[index], y, width, h, undefined, LIGHT_BORDER));
        setFont(pdf, 5.9, 'normal');
        setTextColor(pdf, TEXT);
        drawWrappedLines(pdf, leftLines, x[0] + 1.3, y + 3.4, lineHeight);
        setFont(pdf, 5.9, 'bold');
        drawWrappedLines(pdf, nameLines, x[1] + 1.3, y + 3.4, lineHeight);
        setFont(pdf, 5.9, 'normal');
        drawWrappedLines(pdf, summaryChunk.length ? summaryChunk : [''], x[2] + 1.3, y + 3.4, lineHeight);
        drawWrappedLines(pdf, actionChunk.length ? actionChunk : [''], x[3] + 1.3, y + 3.4, lineHeight);

        if (firstFragment) {
          const count = buildingManagementItemPhotos(report, item.id);
          setFont(pdf, 5.8, 'bold');
          setTextColor(pdf, count ? TEAL : MUTED);
          pdf.text(String(count), x[4] + BUILDING_MANAGEMENT_WIDTHS[4] / 2, y + Math.min(h - 2, 4.2), { align: 'center' });
        }

        y += h;
        offset += chunkSize;
        firstFragment = false;
      }

      if (inlinePhotos && buildingManagementItemPhotos(report, item.id) > 0) {
        y = await drawBuildingManagementItemPhotoEvidence(pdf, report, area, item, y, onProgress);

        if (itemIndex < area.items.length - 1) {
          if (y + 13 > BODY_BOTTOM) {
            y = addContentPage(pdf, report, runningTitle);
            y = drawBuildingManagementCategoryHeader(pdf, y, area.name, true);
          }
          y = drawBuildingManagementTableHeader(pdf, y, daily);
        }
      }
    }

    y += 2.5;
  }
}

function drawBuildingManagementClosingPages(pdf: jsPDF, report: ReportData) {
  const template = getReportTemplate(report.details.reportType);
  const runningTitle = template.shortLabel;
  let y = addContentPage(pdf, report, runningTitle);
  y = drawRoutinePageHeading(pdf, y, template.finalSectionTitle);

  const signoffKeys = new Set(['agentSignName', 'agentSignDate']);
  template.summaryFields.forEach((field) => {
    if (signoffKeys.has(String(field.key))) return;
    const fieldValue = detailFieldValue(report, field);
    y = field.multiline
      ? drawNarrativeSection(pdf, report, y, field.label, fieldValue || 'No comments recorded.')
      : drawRoutineDetailRow(pdf, y, field.label, fieldValue);
  });

  if (y + 48 > BODY_BOTTOM) y = addContentPage(pdf, report, runningTitle);
  y = drawAgentSignoff(pdf, y, report, 'Building Manager / Prepared by');
  y += 3;
  drawDisclaimerSection(pdf, report, y);
}

async function drawBuildingManagementReportPages(
  pdf: jsPDF,
  report: ReportData,
  onProgress?: (message: string) => void
) {
  const overviewEnd = drawBuildingManagementOverview(pdf, report);
  await drawBuildingManagementActivityPages(pdf, report, overviewEnd, onProgress);
}

interface ExitItemFragment {
  nameLines: string[];
  agentLines: string[];
  first: boolean;
}

function exitColumnPositions(): number[] {
  const positions: number[] = [MARGIN_X];
  EXIT_COLUMN_WIDTHS.forEach((width) => positions.push(positions[positions.length - 1] + width));
  return positions;
}

function drawExitAgentHeader(pdf: jsPDF, y: number): number {
  const h = 10.5;
  drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, h, LIGHT_FILL, BORDER);
  setFont(pdf, 6.7, 'bold');
  setTextColor(pdf, NAVY);
  pdf.text('Agent section', PAGE_WIDTH / 2, y + 3.2, { align: 'center' });
  setFont(pdf, 5.1, 'normal');
  setTextColor(pdf, TEXT);
  const lines = wrapText(
    pdf,
    "Each item records whether it was clean, undamaged and working at the exit inspection. Y = yes, N = no. Detailed observations are recorded in Agent comments.",
    CONTENT_WIDTH - 5
  );
  drawWrappedLines(pdf, lines, PAGE_WIDTH / 2, y + 6.1, 1.9, { align: 'center', maxLines: 2 });
  return y + h;
}

function drawExitAreaHeader(pdf: jsPDF, y: number, areaName: string, continuation: boolean): number {
  const x = exitColumnPositions();
  const h = 7.8;
  EXIT_COLUMN_WIDTHS.forEach((width, index) => drawBox(pdf, x[index], y, width, h, SECTION_FILL, BORDER));

  setFont(pdf, 6.2, 'bold');
  setTextColor(pdf, TEXT);
  const label = continuation ? `${areaName.toUpperCase()} (CONTINUED)` : areaName.toUpperCase();
  const areaLines = wrapText(pdf, label, EXIT_COLUMN_WIDTHS[0] - 2.2);
  drawWrappedLines(pdf, areaLines, x[0] + 1.2, y + 2.9, 2.2, { maxLines: 2 });

  ['Cln', 'Udg', 'Wkg'].forEach((heading, index) => {
    pdf.text(heading, x[index + 1] + (EXIT_COLUMN_WIDTHS[index + 1] / 2), y + 4.8, { align: 'center' });
  });
  pdf.text('Agent comments', x[4] + (EXIT_COLUMN_WIDTHS[4] / 2), y + 3.1, { align: 'center' });
  setFont(pdf, 4.6, 'normal');
  pdf.text('Cln = Clean, Udg = Undamaged, Wkg = Working', x[4] + (EXIT_COLUMN_WIDTHS[4] / 2), y + 6, { align: 'center' });

  return y + h;
}

function drawExitOverallRow(pdf: jsPDF, y: number, count: number): number {
  const x = exitColumnPositions();
  const h = 5.8;
  EXIT_COLUMN_WIDTHS.forEach((width, index) => drawBox(pdf, x[index], y, width, h, undefined, LIGHT_BORDER));
  setFont(pdf, 5.9, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text('Overall', x[0] + 1.2, y + 3.8);
  if (count > 0) {
    setFont(pdf, 5.5, 'normal');
    setTextColor(pdf, TEAL);
    pdf.text(`(${count} ${count === 1 ? 'photo' : 'photos'}, see photo gallery)`, x[4] + 1.2, y + 3.8);
  }
  return y + h;
}

function exitItemFragments(pdf: jsPDF, item: InspectionItem): ExitItemFragment[] {
  setFont(pdf, 6.4, 'normal');
  const nameLines = wrapText(pdf, value(item.name), EXIT_COLUMN_WIDTHS[0] - 2.4);
  const agentLines = wrapText(pdf, value(item.agentComments), EXIT_COLUMN_WIDTHS[4] - 2.4);
  const maxLinesPerFragment = 86;
  const count = Math.max(nameLines.length, agentLines.length, 1);
  const fragments: ExitItemFragment[] = [];

  for (let start = 0; start < count; start += maxLinesPerFragment) {
    const first = start === 0;
    fragments.push({
      nameLines: first ? nameLines.slice(start, start + maxLinesPerFragment) : [`${value(item.name)} (continued)`],
      agentLines: agentLines.slice(start, start + maxLinesPerFragment),
      first,
    });
  }

  return fragments;
}

function exitFragmentHeight(fragment: ExitItemFragment): number {
  const lineCount = Math.max(fragment.nameLines.length, fragment.agentLines.length, 1);
  return Math.max(5.6, (lineCount * 2.6) + 2.5);
}

function drawExitItemRow(pdf: jsPDF, y: number, item: InspectionItem, fragment: ExitItemFragment): number {
  const x = exitColumnPositions();
  const h = exitFragmentHeight(fragment);
  EXIT_COLUMN_WIDTHS.forEach((width, index) => drawBox(pdf, x[index], y, width, h, undefined, LIGHT_BORDER));

  setFont(pdf, 6.4, 'bold');
  setTextColor(pdf, TEXT);
  drawWrappedLines(pdf, fragment.nameLines, x[0] + 1.2, y + 3.1, 2.6);
  setFont(pdf, 6.4, 'normal');
  drawWrappedLines(pdf, fragment.agentLines, x[4] + 1.2, y + 3.1, 2.6);

  if (fragment.first) {
    const midY = y + (h / 2) + 0.9;
    drawBoolean(pdf, item.clean, x[1] + (EXIT_COLUMN_WIDTHS[1] / 2), midY);
    drawBoolean(pdf, item.undamaged, x[2] + (EXIT_COLUMN_WIDTHS[2] / 2), midY);
    drawBoolean(pdf, item.working, x[3] + (EXIT_COLUMN_WIDTHS[3] / 2), midY);
  }

  return y + h;
}

function startExitConditionPage(pdf: jsPDF, report: ReportData): number {
  let y = addContentPage(pdf, report, 'Exit Condition Report');
  y = drawExitAgentHeader(pdf, y);
  return y;
}

function drawExitConditionPages(pdf: jsPDF, report: ReportData, onProgress?: (message: string) => void) {
  if (!report.areas.length) return;

  let y = startExitConditionPage(pdf, report);

  report.areas.forEach((area, areaIndex) => {
    onProgress?.(`Laying out exit inspection area ${areaIndex + 1} of ${report.areas.length}...`);
    const count = areaPhotoCount(report, area);
    const fragments = area.items.flatMap((item) =>
      exitItemFragments(pdf, item).map((fragment) => ({ item, fragment }))
    );
    const firstHeight = fragments.length ? exitFragmentHeight(fragments[0].fragment) : 0;
    const initialNeed = 7.8 + (count > 0 ? 5.8 : 0) + firstHeight;

    if (y + initialNeed > BODY_BOTTOM) {
      y = startExitConditionPage(pdf, report);
    }

    y = drawExitAreaHeader(pdf, y, area.name, false);
    if (count > 0) y = drawExitOverallRow(pdf, y, count);

    fragments.forEach(({ item, fragment }) => {
      const h = exitFragmentHeight(fragment);
      if (y + h > BODY_BOTTOM) {
        y = startExitConditionPage(pdf, report);
        y = drawExitAreaHeader(pdf, y, area.name, true);
      }
      y = drawExitItemRow(pdf, y, item, fragment);
    });

    if (!fragments.length) {
      const placeholder: InspectionItem = {
        id: `${area.id}-empty`,
        name: 'Overall',
        agentComments: 'No condition commentary recorded.',
      };
      const fragment = exitItemFragments(pdf, placeholder)[0];
      if (y + exitFragmentHeight(fragment) > BODY_BOTTOM) {
        y = startExitConditionPage(pdf, report);
        y = drawExitAreaHeader(pdf, y, area.name, true);
      }
      y = drawExitItemRow(pdf, y, placeholder, fragment);
    }
  });
}

function photoCaption(photo: ReportPhoto, total: number, ordinal: number, report: ReportData): string {
  const area = value(photo.areaName) || 'General';
  const currentItem = photo.itemId
    ? report.areas.flatMap((reportArea) => reportArea.items).find((item) => item.id === photo.itemId)
    : undefined;
  const item = value(currentItem?.name) || value(photo.itemName);
  return item
    ? `${area}: ${item} (photo ${ordinal} of ${total})`
    : `${area}: Overall (photo ${ordinal} of ${total})`;
}

async function drawPhotoPages(pdf: jsPDF, report: ReportData, onProgress?: (message: string) => void) {
  if (!report.photos.length) return;

  const areaOrder = new Map(
    report.areas.map((area, index) => [area.name.trim().toLowerCase(), index])
  );
  const itemOrder = new Map<string, number>();
  report.areas.forEach((area) => {
    area.items.forEach((item, index) => itemOrder.set(item.id, index));
  });

  const orderedPhotos = report.photos
    .map((photo, originalIndex) => ({ photo, originalIndex }))
    .sort((a, b) => {
      const areaA = (value(a.photo.areaName) || 'General').toLowerCase();
      const areaB = (value(b.photo.areaName) || 'General').toLowerCase();
      const orderA = areaOrder.get(areaA) ?? Number.MAX_SAFE_INTEGER;
      const orderB = areaOrder.get(areaB) ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      if (areaA !== areaB) return areaA.localeCompare(areaB);

      const itemA = a.photo.itemId ? itemOrder.get(a.photo.itemId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
      const itemB = b.photo.itemId ? itemOrder.get(b.photo.itemId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
      if (itemA !== itemB) return itemA - itemB;

      const indexA = a.photo.photoIndex ?? Number.MAX_SAFE_INTEGER;
      const indexB = b.photo.photoIndex ?? Number.MAX_SAFE_INTEGER;
      if (indexA !== indexB) return indexA - indexB;
      return a.originalIndex - b.originalIndex;
    })
    .map(({ photo }) => photo);

  const photoGroupKey = (photo: ReportPhoto) =>
    photo.itemId || `area:${(value(photo.areaName) || 'General').toLowerCase()}`;

  const counts = new Map<string, number>();
  orderedPhotos.forEach((photo) => {
    const key = photoGroupKey(photo);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const ordinals = new Map<string, number>();
  const photoOrdinal = new Map<string, number>();
  orderedPhotos.forEach((photo) => {
    const key = photoGroupKey(photo);
    const ordinal = (ordinals.get(key) || 0) + 1;
    ordinals.set(key, ordinal);
    photoOrdinal.set(photo.id, ordinal);
  });

  const photosPerPage = 12;
  const columns = 3;
  const rows = 4;
  const gapX = 3;
  const gapY = 3;
  const firstTitleHeight = 7;
  const cellWidth = (CONTENT_WIDTH - (gapX * (columns - 1))) / columns;
  const captionHeight = 7.1;
  let embedded = 0;

  for (let pageStart = 0; pageStart < orderedPhotos.length; pageStart += photosPerPage) {
    const pagePhotos = orderedPhotos.slice(pageStart, pageStart + photosPerPage);
    const pageNumber = Math.floor(pageStart / photosPerPage) + 1;
    const photoPageCount = Math.ceil(orderedPhotos.length / photosPerPage);

    const buildingManagement = isBuildingManagementTemplate(report.details.reportType);
    let y = addContentPage(pdf, report, buildingManagement ? 'Building Manager Photo Evidence' : 'Inspection Photos');
    if (pageStart === 0) {
      drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, firstTitleHeight, SECTION_FILL, BORDER);
      setFont(pdf, 7, 'bold');
      setTextColor(pdf, TEXT);
      pdf.text(
        buildingManagement
          ? `Item-linked Photo Evidence (${orderedPhotos.length} photos)`
          : `Agent Inspection Photos (${orderedPhotos.length} photos)`,
        MARGIN_X + 1.5,
        y + 4.6
      );
      y += firstTitleHeight + 2;
    }

    const gridTop = y;
    const availableHeight = BODY_BOTTOM - gridTop;
    const cellHeight = (availableHeight - (gapY * (rows - 1))) / rows;
    if (cellHeight <= captionHeight + 4) {
      throw new Error('PDF photo layout validation failed because the gallery cells are too small.');
    }

    onProgress?.(`Rendering photo page ${pageNumber} of ${photoPageCount}...`);

    for (let i = 0; i < pagePhotos.length; i++) {
      const photo = pagePhotos[i];
      const source = photoSource(photo);
      if (!source) {
        throw new Error(`Photo "${photo.name || photo.id}" has no image source. The report was not finalised.`);
      }

      const row = Math.floor(i / columns);
      const col = i % columns;
      const x = MARGIN_X + (col * (cellWidth + gapX));
      const cellY = y + (row * (cellHeight + gapY));

      drawBox(pdf, x, cellY, cellWidth, cellHeight, undefined, LIGHT_BORDER);
      setFont(pdf, 5.2, 'bold');
      setTextColor(pdf, TEXT);
      const groupKey = photoGroupKey(photo);
      const caption = wrapText(
        pdf,
        photoCaption(photo, counts.get(groupKey) || 1, photoOrdinal.get(photo.id) || 1, report),
        cellWidth - 2
      );
      drawWrappedLines(pdf, caption, x + 1, cellY + 2.4, 1.9, { maxLines: 3 });

      const imageY = cellY + captionHeight;
      const imageHeight = cellHeight - captionHeight;
      const image = await prepareImageForPdf(source, photo.name || `photo ${embedded + 1}`, 720, 45_000);
      const fit = containRect(image.width, image.height, cellWidth - 1.2, imageHeight - 1.2);

      pdf.addImage(
        image.bytes,
        'JPEG',
        x + 0.6 + fit.xOffset,
        imageY + 0.6 + fit.yOffset,
        fit.width,
        fit.height,
        undefined,
        'FAST'
      );

      embedded += 1;
      if (embedded % 4 === 0) await yieldToBrowser();
    }
  }

  if (embedded !== orderedPhotos.length) {
    throw new Error(`PDF photo validation failed: expected ${orderedPhotos.length} photos but embedded ${embedded}.`);
  }
}

function drawDateRow(pdf: jsPDF, y: number, label: string, date: string): number {
  const h = 8.2;
  drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, h, undefined, LIGHT_BORDER);
  setFont(pdf, 6.7, 'normal');
  setTextColor(pdf, TEXT);
  pdf.text(label, MARGIN_X + 1.8, y + 5.2);
  drawBox(pdf, PAGE_WIDTH - MARGIN_X - 53, y + 0.9, 51.5, h - 1.8, LIGHT_FILL, LIGHT_BORDER);
  pdf.text(formatAustralianDate(date) || '/ /', PAGE_WIDTH - MARGIN_X - 27.2, y + 5.2, { align: 'center' });
  return y + h;
}

function drawFinalPage(pdf: jsPDF, report: ReportData) {
  let y = addContentPage(pdf, report);
  const details = report.details;

  if (details.reportType === 'Exit') {
    drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, 8, SECTION_FILL, BORDER);
    setFont(pdf, 7.4, 'bold');
    setTextColor(pdf, NAVY);
    pdf.text('Special Reporting at Exit Condition Report', MARGIN_X + 1.8, y + 5.1);
    y += 12;

    setFont(pdf, 7.5, 'bold');
    setTextColor(pdf, TEXT);
    pdf.text('Approximate dates when work last done on residential premises', MARGIN_X, y);
    y += 3.5;
    y = drawDateRow(pdf, y, 'Painting of premises (external):', value(details.paintingPremisesExternalDate));
    y = drawDateRow(pdf, y, 'Painting of premises (internal):', value(details.paintingPremisesInternalDate));
    y = drawDateRow(pdf, y, 'Floorcoverings laid:', value(details.floorcoveringsLaidDate));
    y = drawDateRow(pdf, y, 'Floorcoverings professionally cleaned:', value(details.floorcoveringsCleanedDate));
    y += 4;

    y = drawNarrativeSection(pdf, report, y, 'Exit Report Additional Comments', details.additionalComments);

    if (y + 48 > BODY_BOTTOM) {
      y = addContentPage(pdf, report, 'Exit Condition Report');
    }
    y = drawAgentSignoff(pdf, y, report, 'Agent Signature at the END of the Tenancy');
    y += 3;
    drawDisclaimerSection(pdf, report, y);
    return;
  }

  setFont(pdf, 8, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text('Entry Report Additional comments', MARGIN_X, y + 3.5);
  y += 6;
  drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, 32, LIGHT_FILL, BORDER);
  setFont(pdf, 7, 'normal');
  const comments = wrapText(pdf, value(details.additionalComments) || 'No additional general comments provided.', CONTENT_WIDTH - 4);
  drawWrappedLines(pdf, comments, MARGIN_X + 2, y + 4.6, 2.8, { maxLines: 9 });
  y += 36;

  setFont(pdf, 7.5, 'bold');
  pdf.text('Approximate dates when work last done on residential premises', MARGIN_X, y);
  y += 3.2;
  y = drawDateRow(pdf, y, 'Painting of premises (external):', value(details.paintingPremisesExternalDate));
  y = drawDateRow(pdf, y, 'Painting of premises (internal):', value(details.paintingPremisesInternalDate));
  y = drawDateRow(pdf, y, 'Floorcoverings laid:', value(details.floorcoveringsLaidDate));
  y = drawDateRow(pdf, y, 'Floorcoverings professionally cleaned:', value(details.floorcoveringsCleanedDate));
  setFont(pdf, 5.8, 'italic');
  setTextColor(pdf, MUTED);
  pdf.text('Further items and comments may be recorded on a separate sheet signed by the lessor/property manager and tenant.', MARGIN_X, y + 3.5);
  y += 7.5;

  y = drawAgentSignoff(pdf, y, report, "Lessor/property manager's signature");

  drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, 8, SECTION_FILL, BORDER);
  setFont(pdf, 7.2, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text("Tenant's Acknowledgement & Signature", MARGIN_X + 1.8, y + 5.1);
  y += 8;
  setFont(pdf, 6.2, 'normal');
  const statement = wrapText(
    pdf,
    'I/we have received and read the Condition Report for the above property and understand that it must be returned within 7 days.',
    CONTENT_WIDTH - 3
  );
  drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, 11, undefined, LIGHT_BORDER);
  drawWrappedLines(pdf, statement, MARGIN_X + 1.8, y + 3.8, 2.6, { maxLines: 3 });
  y += 11;

  const parsedTenantNames = splitTenantNames(details.tenants, 3);
  const tenantNames = [
    value(details.tenant1SignName) || parsedTenantNames[0] || '',
    value(details.tenant2SignName) || parsedTenantNames[1] || '',
    value(details.tenant3SignName) || parsedTenantNames[2] || '',
  ];

  tenantNames.forEach((name, index) => {
    drawBox(pdf, MARGIN_X, y, 62, 18, undefined, LIGHT_BORDER);
    drawBox(pdf, MARGIN_X + 62, y, 82, 18, undefined, LIGHT_BORDER);
    drawBox(pdf, MARGIN_X + 144, y, CONTENT_WIDTH - 144, 18, undefined, LIGHT_BORDER);
    setFont(pdf, 6.2, 'bold');
    pdf.text(`Tenant ${index + 1}`, MARGIN_X + 1.8, y + 4);
    setFont(pdf, 5.8, 'normal');
    pdf.text('Print Name:', MARGIN_X + 1.8, y + 7.3);
    setFont(pdf, 7.2, 'bold');
    pdf.text(name, MARGIN_X + 1.8, y + 13.2);
    setFont(pdf, 5.8, 'normal');
    pdf.text('Signature:', MARGIN_X + 63.8, y + 4);
    pdf.text('Date:', MARGIN_X + 145.8, y + 4);
    pdf.text('____ / ____ / ________', MARGIN_X + 145.8, y + 13.2);
    y += 18;
  });
  y += 5;

  if (y > BODY_BOTTOM - 16) {
    throw new Error('Final report signature page content exceeds the available A4 page height.');
  }

  setFont(pdf, 6.2, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text('DISCLAIMER:', MARGIN_X, y);
  setFont(pdf, 6, 'italic');
  setTextColor(pdf, MUTED);
  const disclaimer = wrapText(pdf, value(details.disclaimerText), CONTENT_WIDTH);
  drawWrappedLines(pdf, disclaimer, MARGIN_X, y + 3.8, 2.5, { maxLines: Math.max(1, Math.floor((BODY_BOTTOM - y - 5) / 2.5)) });
}

interface KeyReceiptFragment {
  nameLines: string[];
  identifierLines: string[];
  first: boolean;
}

const KEY_RECEIPT_WIDTHS = [20, 62, CONTENT_WIDTH - 82] as const;

function keyReceiptColumnPositions(): number[] {
  const positions: number[] = [MARGIN_X];
  KEY_RECEIPT_WIDTHS.forEach((width) => positions.push(positions[positions.length - 1] + width));
  return positions;
}

function startKeyReceiptPage(pdf: jsPDF, report: ReportData, firstPage: boolean): number {
  if (!firstPage) pdf.addPage('a4', 'portrait');

  drawBrand(pdf, MARGIN_X + 2, 9, 0.72);
  setFont(pdf, 15, 'bold');
  setTextColor(pdf, NAVY);
  pdf.text('KEY RECEIPT', PAGE_WIDTH - MARGIN_X, 17, { align: 'right' });
  setFont(pdf, 5.6, 'bold');
  setTextColor(pdf, MUTED);
  pdf.text('TENANCY KEY / ACCESS DEVICE HANDOVER', PAGE_WIDTH - MARGIN_X, 22, { align: 'right' });
  pdf.setDrawColor(...TEAL);
  pdf.setLineWidth(0.65);
  pdf.line(MARGIN_X, 27, PAGE_WIDTH - MARGIN_X, 27);

  if (!firstPage) {
    setFont(pdf, 6.2, 'bold');
    setTextColor(pdf, MUTED);
    pdf.text('CONTINUATION', PAGE_WIDTH - MARGIN_X, 32, { align: 'right' });
    return 36;
  }

  return 33;
}

function drawKeyReceiptDetails(pdf: jsPDF, report: ReportData, startY: number): number {
  let y = startY;
  y = drawRoutinePageHeading(pdf, y, 'Key Handover Details');
  const details = report.details;
  const rows: Array<[string, string]> = [
    ['Property Address', value(details.propertyAddress)],
    ['Tenant / Recipient', value(details.tenants)],
    ['Tenancy Commencement Date', formatAustralianDate(details.tenancyStartDate)],
    ['Date Keys / Access Devices Received', formatAustralianDate(details.inspectionDate)],
    ['Time Received', value(details.keyReceiptTime)],
    ['Issued By', value(details.inspectingAgent)],
    ['Reference', value(details.referenceNumber)],
  ];

  rows.forEach(([label, content]) => {
    const h = routineDetailRowHeight(pdf, label, content);
    if (y + h > BODY_BOTTOM) {
      y = startKeyReceiptPage(pdf, report, false);
      y = drawRoutinePageHeading(pdf, y, 'Key Handover Details (continued)');
    }
    y = drawRoutineDetailRow(pdf, y, label, content);
  });

  return y + 4;
}

function drawKeyReceiptTableHeader(pdf: jsPDF, y: number, continuation: boolean): number {
  y = drawRoutinePageHeading(
    pdf,
    y,
    continuation ? 'Keys & Access Devices Received (continued)' : 'Keys & Access Devices Received'
  );

  const x = keyReceiptColumnPositions();
  const h = 7.2;
  KEY_RECEIPT_WIDTHS.forEach((width, index) => drawBox(pdf, x[index], y, width, h, LIGHT_FILL, BORDER));
  setFont(pdf, 6.1, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text('Quantity', x[0] + KEY_RECEIPT_WIDTHS[0] / 2, y + 4.7, { align: 'center' });
  pdf.text('Key / Access Device', x[1] + 1.5, y + 4.7);
  pdf.text('Identifier / Notes', x[2] + 1.5, y + 4.7);
  return y + h;
}

function splitKeyReceiptFragments(pdf: jsPDF, item: InspectionItem): KeyReceiptFragment[] {
  const maxLinesPerFragment = 68;
  setFont(pdf, 6.8, 'normal');
  const nameLines = wrapText(pdf, value(item.name) || 'Key / Access Device', KEY_RECEIPT_WIDTHS[1] - 3);
  const identifierLines = wrapText(pdf, value(item.identifier), KEY_RECEIPT_WIDTHS[2] - 3);
  const lineCount = Math.max(nameLines.length, identifierLines.length, 1);
  const fragments: KeyReceiptFragment[] = [];

  for (let start = 0; start < lineCount; start += maxLinesPerFragment) {
    const first = start === 0;
    fragments.push({
      nameLines: first
        ? nameLines.slice(start, start + maxLinesPerFragment)
        : wrapText(pdf, `${value(item.name) || 'Key / Access Device'} (continued)`, KEY_RECEIPT_WIDTHS[1] - 3),
      identifierLines: identifierLines.slice(start, start + maxLinesPerFragment),
      first,
    });
  }

  return fragments;
}

function keyReceiptFragmentHeight(fragment: KeyReceiptFragment): number {
  const lineHeight = 2.8;
  return Math.max(8, Math.max(fragment.nameLines.length, fragment.identifierLines.length, 1) * lineHeight + 3.2);
}

function drawKeyReceiptRow(
  pdf: jsPDF,
  y: number,
  item: InspectionItem,
  fragment: KeyReceiptFragment
): number {
  const x = keyReceiptColumnPositions();
  const h = keyReceiptFragmentHeight(fragment);
  KEY_RECEIPT_WIDTHS.forEach((width, index) => drawBox(pdf, x[index], y, width, h, undefined, LIGHT_BORDER));

  setFont(pdf, 6.8, 'bold');
  setTextColor(pdf, TEXT);
  if (fragment.first) {
    pdf.text(value(item.quantity), x[0] + KEY_RECEIPT_WIDTHS[0] / 2, y + 4.8, { align: 'center' });
  }
  setFont(pdf, 6.8, 'normal');
  drawWrappedLines(pdf, fragment.nameLines, x[1] + 1.5, y + 4.2, 2.8);
  drawWrappedLines(pdf, fragment.identifierLines, x[2] + 1.5, y + 4.2, 2.8);
  return y + h;
}

function keyReceiptItemPhotoList(report: ReportData, itemId: string): ReportPhoto[] {
  return report.photos
    .filter((photo) => photo.itemId === itemId)
    .sort((a, b) => (a.photoIndex || 0) - (b.photoIndex || 0));
}

async function drawKeyReceiptPhotoEvidence(
  pdf: jsPDF,
  report: ReportData,
  items: InspectionItem[],
  onProgress?: (message: string) => void
): Promise<number | null> {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const itemOrder = new Map(items.map((item, index) => [item.id, index]));
  const photos = report.photos
    .filter((photo) => photo.itemId && itemById.has(photo.itemId))
    .sort((a, b) => {
      const itemDelta =
        (itemOrder.get(a.itemId || '') ?? Number.MAX_SAFE_INTEGER) -
        (itemOrder.get(b.itemId || '') ?? Number.MAX_SAFE_INTEGER);
      if (itemDelta) return itemDelta;
      return (a.photoIndex || 0) - (b.photoIndex || 0);
    });

  if (!photos.length) return null;

  const columns = 2;
  const rows = 3;
  const perPage = columns * rows;
  const gapX = 3;
  const gapY = 3;
  const cellWidth = (CONTENT_WIDTH - gapX) / columns;
  let finalY = BODY_TOP;

  for (let pageStart = 0; pageStart < photos.length; pageStart += perPage) {
    const pagePhotos = photos.slice(pageStart, pageStart + perPage);
    let y = startKeyReceiptPage(pdf, report, false);
    y = drawRoutinePageHeading(
      pdf,
      y,
      pageStart === 0
        ? 'Key / Access Device Photo Evidence'
        : 'Key / Access Device Photo Evidence (continued)'
    );
    const availableHeight = BODY_BOTTOM - y;
    const cellHeight = (availableHeight - gapY * (rows - 1)) / rows;
    const captionHeight = 13;

    onProgress?.(
      `Rendering Key Receipt photo evidence ${Math.floor(pageStart / perPage) + 1} of ${Math.ceil(photos.length / perPage)}...`
    );

    for (let index = 0; index < pagePhotos.length; index++) {
      const photo = pagePhotos[index];
      const item = itemById.get(photo.itemId || '');
      const row = Math.floor(index / columns);
      const column = index % columns;
      const x = MARGIN_X + column * (cellWidth + gapX);
      const cellY = y + row * (cellHeight + gapY);

      drawBox(pdf, x, cellY, cellWidth, cellHeight, undefined, LIGHT_BORDER);
      drawBox(pdf, x, cellY, cellWidth, captionHeight, LIGHT_FILL, LIGHT_BORDER);
      setFont(pdf, 5.8, 'bold');
      setTextColor(pdf, NAVY);
      pdf.text(
        truncateTextToWidth(pdf, value(item?.name) || value(photo.itemName) || 'Key / Access Device', cellWidth - 3),
        x + 1.5,
        cellY + 3.6
      );

      setFont(pdf, 5.1, 'normal');
      setTextColor(pdf, TEXT);
      const itemMeta = [
        item?.quantity ? `Qty ${value(item.quantity)}` : '',
        value(item?.identifier),
      ].filter(Boolean).join(' | ');
      if (itemMeta) {
        pdf.text(truncateTextToWidth(pdf, itemMeta, cellWidth - 3), x + 1.5, cellY + 7);
      }
      setTextColor(pdf, MUTED);
      pdf.text(
        truncateTextToWidth(pdf, value(photo.name) || 'Photo evidence', cellWidth - 3),
        x + 1.5,
        cellY + 10.4
      );

      const source = photoSource(photo);
      if (!source) {
        throw new Error(`Key Receipt photo "${photo.name || photo.id}" has no image source.`);
      }
      const image = await prepareImageForPdf(
        source,
        photo.name || 'Key Receipt photo evidence',
        720,
        45_000
      );
      const imageHeight = cellHeight - captionHeight;
      const fit = containRect(image.width, image.height, cellWidth - 2, imageHeight - 2);
      pdf.addImage(
        image.bytes,
        'JPEG',
        x + 1 + fit.xOffset,
        cellY + captionHeight + 1 + fit.yOffset,
        fit.width,
        fit.height,
        undefined,
        'FAST'
      );

      if ((pageStart + index + 1) % 4 === 0) await yieldToBrowser();
    }

    finalY = y + rows * cellHeight + gapY * (rows - 1);
  }

  return finalY;
}

function drawKeyReceiptTextBlock(
  pdf: jsPDF,
  report: ReportData,
  y: number,
  heading: string,
  text: string
): number {
  setFont(pdf, 6.5, 'normal');
  const lines = wrapText(pdf, value(text), CONTENT_WIDTH - 4);
  const lineHeight = 2.7;
  const chunks: string[][] = [];
  for (let start = 0; start < lines.length; start += 78) chunks.push(lines.slice(start, start + 78));

  chunks.forEach((chunk, index) => {
    const h = Math.max(13, chunk.length * lineHeight + 5);
    if (y + h + 8 > BODY_BOTTOM) {
      y = startKeyReceiptPage(pdf, report, false);
    }
    drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, 7.2, SECTION_FILL, BORDER);
    setFont(pdf, 6.8, 'bold');
    setTextColor(pdf, NAVY);
    pdf.text(index === 0 ? heading : `${heading} (continued)`, MARGIN_X + 1.7, y + 4.7);
    y += 7.2;
    drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, h, undefined, LIGHT_BORDER);
    setFont(pdf, 6.5, 'normal');
    setTextColor(pdf, TEXT);
    drawWrappedLines(pdf, chunk, MARGIN_X + 2, y + 4, lineHeight);
    y += h + 3;
  });

  return y;
}

function keyReceiptSignatureNames(report: ReportData): string[] {
  const parsed = splitTenantNames(report.details.tenants, 3);
  const names = [
    value(report.details.tenant1SignName) || parsed[0] || '',
    value(report.details.tenant2SignName) || parsed[1] || '',
    value(report.details.tenant3SignName) || parsed[2] || '',
  ].filter(Boolean);
  return names.length ? names : [''];
}

function drawKeyReceiptSignatures(pdf: jsPDF, report: ReportData, startY: number): number {
  let y = startY;
  const acknowledgement =
    'I/We acknowledge that I/we have received the keys and access devices listed above for the premises stated on this receipt on the date recorded above.';

  setFont(pdf, 6.5, 'normal');
  const ackLines = wrapText(pdf, acknowledgement, CONTENT_WIDTH - 4);
  const ackHeight = Math.max(14, ackLines.length * 2.8 + 6);
  if (y + ackHeight + 12 > BODY_BOTTOM) y = startKeyReceiptPage(pdf, report, false);

  drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, 7.2, SECTION_FILL, BORDER);
  setFont(pdf, 6.8, 'bold');
  setTextColor(pdf, NAVY);
  pdf.text('Tenant Acknowledgement & Signature', MARGIN_X + 1.7, y + 4.7);
  y += 7.2;
  drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, ackHeight, [236, 254, 255], LIGHT_BORDER);
  setFont(pdf, 6.5, 'normal');
  setTextColor(pdf, TEXT);
  drawWrappedLines(pdf, ackLines, MARGIN_X + 2, y + 4.3, 2.8);
  y += ackHeight + 4;

  const widths = [58, 92, CONTENT_WIDTH - 150];
  keyReceiptSignatureNames(report).forEach((name, index) => {
    const h = 19;
    if (y + h > BODY_BOTTOM) {
      y = startKeyReceiptPage(pdf, report, false);
      setFont(pdf, 6.8, 'bold');
      setTextColor(pdf, NAVY);
      pdf.text('Tenant Signature (continued)', MARGIN_X, y + 2);
      y += 5;
    }

    let x = MARGIN_X;
    widths.forEach((width) => {
      drawBox(pdf, x, y, width, h, undefined, LIGHT_BORDER);
      x += width;
    });

    setFont(pdf, 5.8, 'bold');
    setTextColor(pdf, TEXT);
    pdf.text(`Tenant ${index + 1} - Print Name`, MARGIN_X + 1.8, y + 4);
    setFont(pdf, 7.1, 'bold');
    const nameLines = wrapText(pdf, name, widths[0] - 3.6);
    drawWrappedLines(pdf, nameLines, MARGIN_X + 1.8, y + 10.2, 2.9, { maxLines: 2 });

    setFont(pdf, 5.8, 'bold');
    pdf.text('Signature', MARGIN_X + widths[0] + 1.8, y + 4);
    pdf.text('Date', MARGIN_X + widths[0] + widths[1] + 1.8, y + 4);
    setFont(pdf, 6, 'normal');
    pdf.text('____ / ____ / ________', MARGIN_X + widths[0] + widths[1] + 1.8, y + 13.2);
    y += h;
  });

  return y + 4;
}

async function drawKeyReceiptPages(pdf: jsPDF, report: ReportData, onProgress?: (message: string) => void) {
  let y = startKeyReceiptPage(pdf, report, true);
  y = drawKeyReceiptDetails(pdf, report, y);
  y = drawKeyReceiptTableHeader(pdf, y, false);

  const items = report.areas.flatMap((area) => area.items || []);
  const displayItems = items.length
    ? items
    : [{ id: 'key-receipt-empty', name: 'No keys / access devices recorded', quantity: '', identifier: '', agentComments: '' } as InspectionItem];

  displayItems.forEach((item, itemIndex) => {
    onProgress?.(`Laying out key handover item ${itemIndex + 1} of ${displayItems.length}...`);
    const fragments = splitKeyReceiptFragments(pdf, item);
    fragments.forEach((fragment) => {
      const h = keyReceiptFragmentHeight(fragment);
      if (y + h > BODY_BOTTOM - 6) {
        y = startKeyReceiptPage(pdf, report, false);
        y = drawKeyReceiptTableHeader(pdf, y, true);
      }
      y = drawKeyReceiptRow(pdf, y, item, fragment);
    });
  });

  y += 5;
  const evidenceY = await drawKeyReceiptPhotoEvidence(pdf, report, items, onProgress);
  if (evidenceY !== null) {
    y = evidenceY + 4;
  }

  if (value(report.details.additionalComments)) {
    y = drawKeyReceiptTextBlock(pdf, report, y, 'Handover Notes / Comments', report.details.additionalComments);
  }

  y = drawKeyReceiptSignatures(pdf, report, y);

  const disclaimer = value(report.details.disclaimerText);
  if (disclaimer) {
    setFont(pdf, 5.7, 'italic');
    const lines = wrapText(pdf, disclaimer, CONTENT_WIDTH);
    const h = lines.length * 2.35 + 5;
    if (y + h > BODY_BOTTOM) y = startKeyReceiptPage(pdf, report, false);
    setTextColor(pdf, MUTED);
    drawWrappedLines(pdf, lines, MARGIN_X, y + 2.5, 2.35);
  }
}

function drawKeyReceiptFooter(pdf: jsPDF, report: ReportData, pageNumber: number, totalPages: number) {
  pdf.setDrawColor(...LIGHT_BORDER);
  pdf.setLineWidth(0.2);
  pdf.line(MARGIN_X, FOOTER_LINE_Y, PAGE_WIDTH - MARGIN_X, FOOTER_LINE_Y);
  setFont(pdf, 5.4, 'bold');
  setTextColor(pdf, NAVY);
  pdf.text(value(report.details.companyName) || PROINSPECT_COMPANY.name, MARGIN_X, 291.1);
  setFont(pdf, 5.2, 'normal');
  setTextColor(pdf, MUTED);
  const contact = [value(report.details.companyPhone), value(report.details.companyEmail)].filter(Boolean).join(' | ');
  if (contact) pdf.text(contact, MARGIN_X + 25, 291.1);
  setFont(pdf, 6.2, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text(`${pageNumber} / ${totalPages}`, PAGE_WIDTH - MARGIN_X, 291.1, { align: 'right' });
}

function addFooters(pdf: jsPDF, report: ReportData) {
  const total = pdf.getNumberOfPages();
  if (isKeyReceiptTemplate(report.details.reportType)) {
    for (let page = 1; page <= total; page++) {
      pdf.setPage(page);
      drawKeyReceiptFooter(pdf, report, page, total);
    }
    return;
  }

  for (let page = 2; page <= total; page++) {
    pdf.setPage(page);
    drawFooter(pdf, page, total, report.details.reportType === 'Entry');
  }
}

async function drawMaintenanceRegisterPages(
  pdf: jsPDF,
  report: ReportData,
  onProgress?: (message: string) => void
) {
  if (!supportsMaintenanceRegister(report.details.reportType)) return;
  const entries = maintenanceRegisterEntries(report);
  if (!entries.length) return;

  const runningTitle = 'Maintenance Register';
  let y = addContentPage(pdf, report, runningTitle);
  y = drawRoutinePageHeading(pdf, y, 'Maintenance');

  setFont(pdf, 6, 'normal');
  setTextColor(pdf, MUTED);
  const intro = wrapText(
    pdf,
    'The following items were flagged for maintenance during preparation of this report. Read each item together with its source finding and photographic evidence.',
    CONTENT_WIDTH
  );
  drawWrappedLines(pdf, intro, MARGIN_X, y, 2.6);
  y += intro.length * 2.6 + 4;

  for (let index = 0; index < entries.length; index++) {
    const { area, item, photos } = entries[index];
    onProgress?.(`Rendering maintenance item ${index + 1} of ${entries.length}...`);

    setFont(pdf, 5.7, 'normal');
    const narrative = maintenanceNarrative(item) || 'Maintenance commentary not recorded.';
    const narrativeLines = wrapText(pdf, narrative, CONTENT_WIDTH - 4);
    const metaHeight = 12;
    const narrativeHeight = Math.max(10, narrativeLines.length * 2.5 + 6);
    const minimumPhotos = photos.length ? 39 : 0;
    const required = metaHeight + narrativeHeight + Math.min(minimumPhotos, 39) + 5;

    if (y + Math.min(required, 75) > BODY_BOTTOM) {
      y = addContentPage(pdf, report, runningTitle);
      y = drawRoutinePageHeading(pdf, y, 'Maintenance (continued)');
    }

    drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, metaHeight, SECTION_FILL, BORDER);
    setFont(pdf, 5.2, 'bold');
    setTextColor(pdf, MUTED);
    pdf.text('SOURCE AREA', MARGIN_X + 1.6, y + 3.2);
    pdf.text('MAINTENANCE ITEM', MARGIN_X + 48, y + 3.2);
    pdf.text('STATUS / RESPONSIBILITY / DUE', MARGIN_X + 126, y + 3.2);

    setFont(pdf, 6.2, 'bold');
    setTextColor(pdf, TEXT);
    pdf.text(truncateTextToWidth(pdf, area.name, 43), MARGIN_X + 1.6, y + 8);
    pdf.text(truncateTextToWidth(pdf, item.name || 'Untitled item', 73), MARGIN_X + 48, y + 8);
    setFont(pdf, 5.5, 'normal');
    const tracking = [
      value(item.status) || 'Open',
      value(item.activityParty),
      item.dueDate ? `Due ${formatAustralianDate(item.dueDate) || value(item.dueDate)}` : '',
    ].filter(Boolean).join(' | ');
    pdf.text(truncateTextToWidth(pdf, tracking, CONTENT_WIDTH - 128), MARGIN_X + 126, y + 8);
    y += metaHeight;

    drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, narrativeHeight, undefined, LIGHT_BORDER);
    setFont(pdf, 5.2, 'bold');
    setTextColor(pdf, MUTED);
    pdf.text('MAINTENANCE COMMENTARY', MARGIN_X + 1.6, y + 3.4);
    setFont(pdf, 5.9, 'normal');
    setTextColor(pdf, TEXT);
    drawWrappedLines(pdf, narrativeLines, MARGIN_X + 1.6, y + 6.8, 2.5);
    y += narrativeHeight;

    if (photos.length) {
      const columns = 3;
      const gap = 3;
      const cellWidth = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
      const cellHeight = 37;

      for (let photoIndex = 0; photoIndex < photos.length; photoIndex += columns) {
        if (y + cellHeight > BODY_BOTTOM) {
          y = addContentPage(pdf, report, runningTitle);
          y = drawRoutinePageHeading(pdf, y, 'Maintenance Photo Evidence (continued)');
          setFont(pdf, 6, 'bold');
          setTextColor(pdf, TEXT);
          pdf.text(
            truncateTextToWidth(pdf, `${area.name} - ${item.name}`, CONTENT_WIDTH),
            MARGIN_X,
            y + 1.5
          );
          y += 5;
        }

        const row = photos.slice(photoIndex, photoIndex + columns);
        for (let column = 0; column < row.length; column++) {
          const photo = row[column];
          const x = MARGIN_X + column * (cellWidth + gap);
          drawBox(pdf, x, y, cellWidth, cellHeight, [255, 255, 255], LIGHT_BORDER);
          const source = photoSource(photo);
          if (source) {
            const image = await prepareImageForPdf(
              source,
              photo.name || `maintenance photo ${photoIndex + column + 1}`,
              720,
              45_000
            );
            const fit = containRect(image.width, image.height, cellWidth - 2, cellHeight - 7);
            pdf.addImage(
              image.bytes,
              'JPEG',
              x + 1 + fit.xOffset,
              y + 5 + fit.yOffset,
              fit.width,
              fit.height,
              undefined,
              'FAST'
            );
          }
          setFont(pdf, 5, 'bold');
          setTextColor(pdf, TEXT);
          pdf.text(
            `Photo ${photoIndex + column + 1} of ${photos.length}`,
            x + 1.2,
            y + 3.2
          );
        }
        y += cellHeight + 3;
        await yieldToBrowser();
      }
    }

    y += 4;
  }
}

function drawPlacedExecutionFields(pdf: jsPDF, report: ReportData) {
  const execution = report.execution;
  if (!execution?.fields?.length) return;

  const originalPage = pdf.getCurrentPageInfo().pageNumber;
  const totalPages = pdf.getNumberOfPages();

  for (const field of execution.fields) {
    if (!field.pageNumber || field.pageNumber < 1 || field.pageNumber > totalPages) continue;
    const party = field.partyId
      ? execution.parties.find((candidate) => candidate.id === field.partyId)
      : execution.parties[0];
    if (!party) continue;

    const xPercent = Math.max(0, Math.min(100, field.xPercent ?? 10));
    const yPercent = Math.max(0, Math.min(100, field.yPercent ?? 75));
    const widthPercent = Math.max(5, Math.min(100, field.widthPercent ?? 25));
    const width = Math.min(CONTENT_WIDTH, CONTENT_WIDTH * (widthPercent / 100));
    const x = Math.min(PAGE_WIDTH - MARGIN_X - width, MARGIN_X + CONTENT_WIDTH * (xPercent / 100));
    const y = Math.min(BODY_BOTTOM - 16, BODY_TOP + (BODY_BOTTOM - BODY_TOP) * (yPercent / 100));

    pdf.setPage(field.pageNumber);
    drawBox(pdf, x, y, width, 15, [255, 255, 255], BORDER);
    setFont(pdf, 4.8, 'bold');
    setTextColor(pdf, MUTED);
    pdf.text(truncateTextToWidth(pdf, field.label || field.placementLabel || 'Execution field', width - 3), x + 1.5, y + 3.2);

    if (field.fieldType === 'text') {
      setFont(pdf, 6, 'normal');
      setTextColor(pdf, TEXT);
      const lines = wrapText(pdf, field.valueText || '', width - 3);
      drawWrappedLines(pdf, lines, x + 1.5, y + 7, 2.4, { maxLines: 3 });
    } else {
      if (party.signatureDataUrl) {
        try {
          pdf.addImage(party.signatureDataUrl, 'PNG', x + 1.5, y + 4.5, width - 3, 8.5, undefined, 'FAST');
        } catch {
          setFont(pdf, 7, 'italic');
          setTextColor(pdf, TEXT);
          pdf.text(truncateTextToWidth(pdf, party.signedName, width - 3), x + 1.5, y + 10);
        }
      } else {
        setFont(pdf, 7, 'italic');
        setTextColor(pdf, TEXT);
        pdf.text(truncateTextToWidth(pdf, party.signedName, width - 3), x + 1.5, y + 10);
      }
      setFont(pdf, 4.8, 'normal');
      setTextColor(pdf, MUTED);
      pdf.text(truncateTextToWidth(pdf, party.roleLabel, width - 3), x + 1.5, y + 13.6);
    }
  }

  pdf.setPage(originalPage);
}

function drawExecutionPages(pdf: jsPDF, report: ReportData) {
  const execution = report.execution;
  if (!execution?.parties?.length) return;

  let y = addContentPage(pdf, report, 'Execution & Signatures');
  y = drawRoutinePageHeading(pdf, y, 'Execution & Signatures');

  setFont(pdf, 6.2, 'normal');
  setTextColor(pdf, TEXT);
  const intro = wrapText(
    pdf,
    `This execution page records the signatures and acknowledgements completed for this report. Signing request: ${execution.requestId}. Fully executed: ${formatAustralianDate(execution.completedAt) || execution.completedAt}.`,
    CONTENT_WIDTH
  );
  drawWrappedLines(pdf, intro, MARGIN_X, y, 2.7);
  y += Math.max(7, intro.length * 2.7 + 3);

  for (const party of execution.parties) {
    const fieldValues = execution.fields.filter((field) => !field.partyId || field.partyId === party.id);
    const textFields = fieldValues.filter((field) => field.valueText);
    const commentaryLines = party.commentary ? wrapText(pdf, party.commentary, CONTENT_WIDTH - 4) : [];
    const fieldLineCount = textFields.reduce(
      (total, field) => total + wrapText(pdf, `${field.label}: ${field.valueText}`, CONTENT_WIDTH - 4).length,
      0
    );
    const h = Math.max(34, 24 + commentaryLines.length * 2.5 + fieldLineCount * 2.5);

    if (y + h > BODY_BOTTOM) {
      y = addContentPage(pdf, report, 'Execution & Signatures');
      y = drawRoutinePageHeading(pdf, y, 'Execution & Signatures (continued)');
    }

    drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, h, LIGHT_FILL, BORDER);
    setFont(pdf, 7, 'bold');
    setTextColor(pdf, NAVY);
    pdf.text(`${party.roleLabel || 'Signatory'} — ${party.name}`, MARGIN_X + 2, y + 5);

    setFont(pdf, 5.8, 'normal');
    setTextColor(pdf, TEXT);
    pdf.text(`Email: ${party.email}`, MARGIN_X + 2, y + 9);
    pdf.text(`Signed by: ${party.signedName}`, MARGIN_X + 2, y + 12.5);
    pdf.text(`Signed at: ${formatAustralianDate(party.signedAt) || party.signedAt}`, MARGIN_X + 2, y + 16);

    const partySignatureField = fieldValues.find((field) => field.placementLabel);
    if (partySignatureField?.placementLabel) {
      setFont(pdf, 5.5, 'italic');
      setTextColor(pdf, MUTED);
      pdf.text(
        truncateTextToWidth(pdf, `Signature location: ${partySignatureField.placementLabel}`, CONTENT_WIDTH - 70),
        MARGIN_X + 2,
        y + 19.5
      );
    }

    const sigX = PAGE_WIDTH - MARGIN_X - 55;
    const sigY = y + 5;
    const sigW = 51;
    const sigH = 17;
    drawBox(pdf, sigX, sigY, sigW, sigH, [255, 255, 255], LIGHT_BORDER);
    if (party.signatureDataUrl) {
      try {
        pdf.addImage(party.signatureDataUrl, 'PNG', sigX + 2, sigY + 2, sigW - 4, sigH - 4, undefined, 'FAST');
      } catch {
        setFont(pdf, 7, 'italic');
        setTextColor(pdf, TEXT);
        pdf.text(truncateTextToWidth(pdf, party.signedName, sigW - 4), sigX + 2, sigY + 10);
      }
    } else {
      setFont(pdf, 7, 'italic');
      setTextColor(pdf, TEXT);
      pdf.text(truncateTextToWidth(pdf, party.signedName, sigW - 4), sigX + 2, sigY + 10);
    }

    let detailY = y + 24;
    for (const field of textFields) {
      setFont(pdf, 5.7, 'normal');
      setTextColor(pdf, TEXT);
      const lines = wrapText(pdf, `${field.label}: ${field.valueText}`, CONTENT_WIDTH - 4);
      drawWrappedLines(pdf, lines, MARGIN_X + 2, detailY, 2.5);
      detailY += lines.length * 2.5 + 1;
    }

    if (commentaryLines.length) {
      setFont(pdf, 5.7, 'bold');
      pdf.text('Signatory commentary', MARGIN_X + 2, detailY + 1);
      detailY += 4;
      setFont(pdf, 5.7, 'normal');
      drawWrappedLines(pdf, commentaryLines, MARGIN_X + 2, detailY, 2.5);
    }

    y += h + 3;
  }
}

export async function generateReportPdf(
  report: ReportData,
  onProgress?: (message: string) => void
): Promise<Blob> {
  assertReportReadyForPdf(report);

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
    putOnlyUsedFonts: true,
  });

  pdf.setProperties({
    title: `ProInspect ${reportInstanceTitle(report)} - ${value(report.details.propertyAddress)}`,
    subject: reportInstanceTitle(report),
    author: value(report.details.companyName) || PROINSPECT_COMPANY.name,
    creator: 'ProInspect Property Reports',
  });

  if (isKeyReceiptTemplate(report.details.reportType)) {
    onProgress?.('Building Key Receipt...');
    await drawKeyReceiptPages(pdf, report, onProgress);
  } else {
    onProgress?.('Building report cover...');
    await drawCoverPage(pdf, report, onProgress);
  }

  if (isKeyReceiptTemplate(report.details.reportType)) {
    // Dedicated Key Receipt is a compact handover form and does not use a cover page.
  } else if (report.details.reportType === 'Entry') {
    onProgress?.('Building statutory Form 1 page...');
    drawStatutoryPage(pdf, report);
    drawEntryConditionPages(pdf, report, onProgress);
    await drawPhotoPages(pdf, report, onProgress);
    onProgress?.('Building signatures and final page...');
    drawFinalPage(pdf, report);
  } else if (report.details.reportType === 'Routine') {
    onProgress?.('Building routine inspection summary and findings...');
    drawRoutineFindingsPages(pdf, report, onProgress);
    onProgress?.('Building routine inspection summary and maintenance actions...');
    drawRoutineClosingPages(pdf, report);
    await drawPhotoPages(pdf, report, onProgress);
  } else if (report.details.reportType === 'Exit') {
    onProgress?.('Building exit condition tables...');
    drawExitConditionPages(pdf, report, onProgress);
    await drawPhotoPages(pdf, report, onProgress);
    onProgress?.('Building exit special reporting and sign-off...');
    drawFinalPage(pdf, report);
  } else if (report.details.reportType === 'Custom') {
    onProgress?.('Building Custom Report commentary and linked photo evidence...');
    await drawCustomReportPages(pdf, report, onProgress);
    onProgress?.('Building Custom Report summary and sign-off...');
    drawGenericClosingPages(pdf, report);
  } else if (isBuildingManagementTemplate(report.details.reportType)) {
    const template = getReportTemplate(report.details.reportType);
    onProgress?.(`Building ${template.label}...`);
    await drawBuildingManagementReportPages(pdf, report, onProgress);
    if (
      report.details.reportType !== 'BuildingManagementMonthly' &&
      report.details.reportType !== 'UpdatedBusinessManagement'
    ) {
      await drawPhotoPages(pdf, report, onProgress);
    }
    onProgress?.('Building Building Manager summary and sign-off...');
    drawBuildingManagementClosingPages(pdf, report);
  } else {
    const template = getReportTemplate(report.details.reportType);
    onProgress?.(`Building ${template.label}...`);
    drawExtendedReportPages(pdf, report, onProgress);
    await drawPhotoPages(pdf, report, onProgress);
    onProgress?.('Building report summary and sign-off...');
    drawGenericClosingPages(pdf, report);
  }

  if (supportsMaintenanceRegister(report.details.reportType) && maintenanceRegisterEntries(report).length > 0) {
    onProgress?.('Building maintenance register...');
    await drawMaintenanceRegisterPages(pdf, report, onProgress);
  }

  if (report.execution?.parties?.length) {
    onProgress?.('Applying placed signature and text fields...');
    drawPlacedExecutionFields(pdf, report);
    onProgress?.('Building execution and signature pages...');
    drawExecutionPages(pdf, report);
  }

  addFooters(pdf, report);

  const photoPageMinimum = report.photos.length ? Math.ceil(report.photos.length / 12) : 0;
  const template = getReportTemplate(report.details.reportType);
  const expectedMinimumPages =
    isKeyReceiptTemplate(report.details.reportType)
      ? 1
      : report.details.reportType === 'Entry'
      ? 3 + (report.areas.length ? 1 : 0) + photoPageMinimum
      : report.details.reportType === 'Routine'
      ? 3 + photoPageMinimum
      : report.details.reportType === 'Exit'
      ? 2 + (report.areas.length ? 1 : 0) + photoPageMinimum
      : report.details.reportType === 'BuildingManagementMonthly' ||
        report.details.reportType === 'UpdatedBusinessManagement'
      ? 3
      : template.family === 'condition'
      ? 3 + (report.areas.length ? 1 : 0) + photoPageMinimum
      : 3 + photoPageMinimum;

  if (pdf.getNumberOfPages() < expectedMinimumPages) {
    throw new Error('PDF validation failed because the generated page count was lower than expected.');
  }

  onProgress?.(`Finalising ${pdf.getNumberOfPages()}-page PDF...`);
  return pdf.output('blob');
}

export function downloadPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

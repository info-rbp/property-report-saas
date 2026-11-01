import { getReportTemplate, isBuildingManagementTemplate, isKeyReceiptTemplate } from '../data/reportCatalogue';
import { normalizeAreaName } from './reportFormatting';
import { ReportData } from '../types/report';

export interface ReportValidationIssue {
  code: string;
  message: string;
  areaId?: string;
  itemId?: string;
  photoId?: string;
}

function requiredText(value?: string | null): boolean {
  return Boolean((value || '').trim());
}

export function validateReportStructure(report: ReportData): ReportValidationIssue[] {
  const issues: ReportValidationIssue[] = [];

  try {
    getReportTemplate(report.details?.reportType);
  } catch {
    issues.push({
      code: 'unknown-report-type',
      message: 'The report type is not registered in the report catalogue.',
    });
    return issues;
  }

  const areaIds = new Set<string>();
  const areaNames = new Map<string, string>();
  const itemIds = new Set<string>();
  const itemAreaById = new Map<string, string>();

  for (const area of report.areas || []) {
    if (!area.id?.trim()) {
      issues.push({ code: 'blank-area-id', message: 'A report area is missing its internal ID.' });
    } else if (areaIds.has(area.id)) {
      issues.push({
        code: 'duplicate-area-id',
        message: `Duplicate report area ID detected for "${area.name || 'Unnamed area'}".`,
        areaId: area.id,
      });
    } else {
      areaIds.add(area.id);
    }

    const normalizedName = normalizeAreaName(area.name);
    if (!normalizedName) {
      issues.push({
        code: 'blank-area-name',
        message: 'A report area has no name.',
        areaId: area.id,
      });
    } else if (areaNames.has(normalizedName)) {
      issues.push({
        code: 'duplicate-area-name',
        message: `Duplicate report area name detected: "${area.name}".`,
        areaId: area.id,
      });
    } else {
      areaNames.set(normalizedName, area.id);
    }

    for (const item of area.items || []) {
      if (!item.id?.trim()) {
        issues.push({
          code: 'blank-item-id',
          message: `A reporting item in "${area.name}" is missing its internal ID.`,
          areaId: area.id,
        });
        continue;
      }

      if (itemIds.has(item.id)) {
        issues.push({
          code: 'duplicate-item-id',
          message: `Duplicate reporting item ID detected in "${area.name}".`,
          areaId: area.id,
          itemId: item.id,
        });
      } else {
        itemIds.add(item.id);
        itemAreaById.set(item.id, normalizedName);
      }

      if (!requiredText(item.name)) {
        issues.push({
          code: 'blank-item-name',
          message: `A reporting item in "${area.name}" has no title/name.`,
          areaId: area.id,
          itemId: item.id,
        });
      }
    }
  }

  const photoIds = new Set<string>();
  let coverPhotoCount = 0;

  for (const photo of report.photos || []) {
    if (!photo.id?.trim()) {
      issues.push({ code: 'blank-photo-id', message: 'A report photo is missing its internal ID.' });
      continue;
    }

    if (photoIds.has(photo.id)) {
      issues.push({
        code: 'duplicate-photo-id',
        message: `Duplicate photo ID detected for "${photo.name || photo.id}".`,
        photoId: photo.id,
      });
    } else {
      photoIds.add(photo.id);
    }

    if (photo.isCover) coverPhotoCount += 1;

    const areaKey = normalizeAreaName(photo.areaName);
    if (!areaKey || !areaNames.has(areaKey)) {
      issues.push({
        code: 'photo-area-missing',
        message: `Photo "${photo.name || photo.id}" is not assigned to a current report area/category.`,
        photoId: photo.id,
      });
      continue;
    }

    if (isKeyReceiptTemplate(report.details.reportType) && !photo.itemId) {
      issues.push({
        code: 'key-receipt-photo-item-required',
        message: `Key Receipt photo "${photo.name || photo.id}" must be linked to a specific key or access device.`,
        photoId: photo.id,
      });
      continue;
    }

    if (photo.itemId) {
      const itemArea = itemAreaById.get(photo.itemId);
      if (!itemArea) {
        issues.push({
          code: 'photo-item-missing',
          message: `Photo "${photo.name || photo.id}" is linked to a reporting item that no longer exists.`,
          photoId: photo.id,
          itemId: photo.itemId,
        });
      } else if (itemArea !== areaKey) {
        issues.push({
          code: 'photo-item-area-mismatch',
          message: `Photo "${photo.name || photo.id}" is linked to an item in a different report category.`,
          photoId: photo.id,
          itemId: photo.itemId,
        });
      }
    }
  }

  if (coverPhotoCount > 1) {
    issues.push({
      code: 'multiple-cover-photos',
      message: 'More than one photo is marked as the report cover photo.',
    });
  }

  return issues;
}

export function validateReportForPdf(report: ReportData): ReportValidationIssue[] {
  const issues = validateReportStructure(report);
  for (const photo of report.photos || []) {
    if (!photo.dataUrl && !photo.url) {
      issues.push({
        code: 'photo-source-missing',
        message: `Photo "${photo.name || photo.id}" has no available image source for PDF rendering.`,
        photoId: photo.id,
      });
    }
  }
  return issues;
}

export function validateReportForFinalization(report: ReportData): ReportValidationIssue[] {
  const issues = validateReportStructure(report);

  if (!requiredText(report.details.propertyAddress)) {
    issues.push({ code: 'property-address-required', message: 'Property / site address is required.' });
  }
  if (!requiredText(report.details.inspectionDate)) {
    issues.push({ code: 'inspection-date-required', message: 'Inspection / report date is required.' });
  }
  if (!requiredText(report.details.inspectingAgent)) {
    issues.push({ code: 'inspector-required', message: 'Inspector / prepared-by name is required.' });
  }

  if (report.details.reportType === 'Custom' && !requiredText(report.details.formName)) {
    issues.push({ code: 'custom-report-title-required', message: 'Enter a report title for the Custom Report.' });
  }

  const areas = report.areas || [];
  const itemCount = areas.reduce((total, area) => total + (area.items?.length || 0), 0);
  if (!areas.length) {
    issues.push({ code: 'areas-required', message: 'The report must contain at least one report area/category.' });
  }
  if (itemCount === 0 && !isKeyReceiptTemplate(report.details.reportType)) {
    issues.push({ code: 'items-required', message: 'The report must contain at least one completed reporting item.' });
  }

  if (
    report.details.reportType === 'Custom' &&
    !areas.some((area) => (area.items || []).some((item) => requiredText(item.agentComments)))
  ) {
    issues.push({
      code: 'custom-report-content-required',
      message: 'Add at least one written observation or narrative item to the Custom Report.',
    });
  }

  if (isBuildingManagementTemplate(report.details.reportType)) {
    if (!requiredText(report.details.buildingName)) {
      issues.push({ code: 'building-name-required', message: 'Building / scheme name is required for a Building Manager report.' });
    }
    if (
      report.details.reportType !== 'BuildingManagementDaily' &&
      !requiredText(report.details.reportingPeriod)
    ) {
      issues.push({ code: 'reporting-period-required', message: 'Reporting period is required for a monthly Building Manager report.' });
    }
  }

  if (isKeyReceiptTemplate(report.details.reportType)) {
    if (!requiredText(report.details.tenants)) {
      issues.push({ code: 'key-receipt-tenant-required', message: 'Tenant / recipient name is required for a Key Receipt.' });
    }
    if (!requiredText(report.details.tenancyStartDate)) {
      issues.push({ code: 'key-receipt-start-date-required', message: 'Tenancy commencement date is required for a Key Receipt.' });
    }

    const keyItems = report.areas.flatMap((area) => area.items || []);
    if (keyItems.length === 0) {
      issues.push({ code: 'key-receipt-items-required', message: 'Record at least one key or access device before finalising the Key Receipt.' });
    }

    keyItems.forEach((item) => {
      const quantity = (item.quantity || '').trim();
      if (!quantity) {
        issues.push({
          code: 'key-receipt-quantity-required',
          message: `Enter a quantity for "${item.name || 'key / access device'}".`,
          itemId: item.id,
        });
      } else if (!/^\d+$/.test(quantity) || Number(quantity) <= 0) {
        issues.push({
          code: 'key-receipt-quantity-invalid',
          message: `Quantity for "${item.name || 'key / access device'}" must be a whole number greater than zero.`,
          itemId: item.id,
        });
      }
    });
  }

  return issues;
}

export function reportValidationMessage(issues: ReportValidationIssue[], prefix = 'Report validation failed'): string {
  const unique = Array.from(new Set(issues.map((issue) => issue.message)));
  const shown = unique.slice(0, 5);
  const suffix = unique.length > shown.length ? ` (+${unique.length - shown.length} more)` : '';
  return `${prefix}: ${shown.join(' ')}${suffix}`;
}

export function assertReportReadyForPdf(report: ReportData): void {
  const issues = validateReportForPdf(report);
  if (issues.length) throw new Error(reportValidationMessage(issues, 'PDF generation blocked'));
}

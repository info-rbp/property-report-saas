import { PROINSPECT_COMPANY } from '../config/company';
import { migrateReportData } from '../lib/reportMigration';
import { getReportTemplate, isBuildingManagementTemplate, isKeyReceiptTemplate } from './reportCatalogue';
import { CURRENT_REPORT_SCHEMA_VERSION, InspectionArea, ReportData, ReportType } from '../types/report';

const COMPANY = {
  companyName: PROINSPECT_COMPANY.name,
  companyAddress: PROINSPECT_COMPANY.address,
  companyPhone: PROINSPECT_COMPANY.phone,
  companyEmail: PROINSPECT_COMPANY.email,
  companyWebsite: PROINSPECT_COMPANY.website,
};

function makeDefaultAreas(reportType: ReportType): InspectionArea[] {
  const definition = getReportTemplate(reportType);
  const emptyActivitySections = isBuildingManagementTemplate(reportType) || isKeyReceiptTemplate(reportType);
  return definition.defaultAreas.map((name) => ({
    id: `area-${crypto.randomUUID()}`,
    name,
    items: emptyActivitySections
      ? []
      : [
          {
            id: `item-${crypto.randomUUID()}`,
            name: 'Overall',
            clean: definition.family === 'condition' ? null : undefined,
            undamaged: definition.family === 'condition' ? null : undefined,
            working: definition.family === 'condition' ? null : undefined,
            agentComments: '',
          },
        ],
  }));
}

export function createBlankReport(
  reportType: ReportType,
  property?: { id: string; address: string }
): ReportData {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const template = getReportTemplate(reportType);

  return {
    schemaVersion: CURRENT_REPORT_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    propertyId: property?.id,
    status: 'draft',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    details: {
      reportType,
      formName:
        reportType === 'Entry'
          ? 'Property Condition Report'
          : template.label,
      actNotice: reportType === 'Entry' ? 'RESIDENTIAL TENANCIES ACT 1987 (WA) Section 27C(6)' : '',
      formNumber: reportType === 'Entry' ? 'FORM 1' : undefined,
      governingBody: reportType === 'Entry' ? 'Consumer Protection, Western Australia' : undefined,
      ...COMPANY,
      propertyAddress: property?.address || '',
      inspectingAgent: '',
      inspectionDate: date,
      tenancyStartDate: '',
      leaseExpiryDate: '',
      rentReviewDate: '',
      currentRentalAmount: '',
      tenants: '',
      tenantReceivedDate: '',
      reportReturnDate: '',
      additionalComments: '',
      maintenanceComments: '',
      clientName: '',
      siteContact: '',
      referenceNumber: '',
      inspectionPurpose: '',
      issueSummary: '',
      observedCondition: '',
      urgency: '',
      recommendedAction: '',
      actionRequired: '',
      contractorName: '',
      workOrderReference: '',
      workDescription: '',
      completionDate: '',
      verificationOutcome: '',
      incidentDate: '',
      incidentTime: '',
      incidentCategory: '',
      incidentDescription: '',
      immediateActions: '',
      accessDetails: '',
      meterReadings: '',
      keysAccessDevices: '',
      outstandingItems: '',
      buildingSummary: '',
      buildingName: '',
      strataPlan: '',
      reportingPeriod: '',
      contractorAttendance: '',
      residentMatters: '',
      worksCompleted: '',
      mattersForApproval: '',
      keySafeLocation: '',
      keySafeModel: '',
      installationMethod: '',
      installationOutcome: '',
      codeHandlingNote: reportType === 'KeySafeInstallation'
        ? 'Access code recorded securely and supplied separately. Do not include the code in this report.'
        : '',
      nextReviewDate: '',
      annualSummaryPeriod: '',
      keyReceiptTime: '',
      agentSignName: '',
      agentSignDate: date,
      disclaimerText: template.disclaimer,
    },
    areas: makeDefaultAreas(reportType),
    photos: [],
  };
}

export function normalizeReport(report: ReportData): ReportData {
  const migrated = migrateReportData(report);
  const now = new Date().toISOString();
  const template = getReportTemplate(migrated.details.reportType);
  return {
    ...migrated,
    id: migrated.id || crypto.randomUUID(),
    status: migrated.status || 'draft',
    createdAt: migrated.createdAt || now,
    updatedAt: migrated.updatedAt || now,
    details: {
      ...migrated.details,
      formName: migrated.details.formName || template.label,
      disclaimerText: migrated.details.disclaimerText || template.disclaimer,
    },
    photos: migrated.photos || [],
    areas: migrated.areas || [],
  };
}

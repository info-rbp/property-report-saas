import { createBlankReport, normalizeReport } from '../data/reportTemplates';
import { InspectionArea, InspectionItem, PropertyRecord, ReportData } from '../types/report';

const RESET_DETAIL_KEYS = new Set([
  'inspectionDate',
  'reportingPeriod',
  'agentSignName',
  'agentSignDate',
  'tenant1SignName',
  'tenant2SignName',
  'tenant3SignName',
  'coverPhotoUrl',
  'coverPhotoStorageKey',
]);

const RESET_NARRATIVE_KEYS = new Set([
  'additionalComments',
  'maintenanceComments',
  'issueSummary',
  'observedCondition',
  'recommendedAction',
  'actionRequired',
  'workDescription',
  'verificationOutcome',
  'incidentDescription',
  'immediateActions',
  'outstandingItems',
  'buildingSummary',
  'contractorAttendance',
  'residentMatters',
  'worksCompleted',
  'mattersForApproval',
]);

function cloneItemForTemplate(item: InspectionItem): InspectionItem {
  return {
    ...item,
    id: `template-item-${crypto.randomUUID()}`,
    agentComments: '',
    actionComments: '',
    activityDate: '',
    activityTime: '',
    activityParty: '',
    status: undefined,
    dueDate: '',
    maintenanceRequired: false,
    maintenanceCommentary: '',
    tenantComments: '',
    tenantAgrees: null,
  };
}

function cloneAreaForTemplate(area: InspectionArea): InspectionArea {
  return {
    ...area,
    id: `template-area-${crypto.randomUUID()}`,
    overallPhotoCount: 0,
    items: area.items.map(cloneItemForTemplate),
  };
}

export function createTemplateSnapshot(report: ReportData): ReportData {
  const details = { ...report.details } as Record<string, unknown>;
  for (const key of RESET_DETAIL_KEYS) details[key] = '';
  for (const key of RESET_NARRATIVE_KEYS) details[key] = '';

  return normalizeReport({
    ...report,
    id: undefined,
    propertyId: undefined,
    status: 'draft',
    completedPdfKey: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    details: details as unknown as ReportData['details'],
    areas: report.areas.map(cloneAreaForTemplate),
    photos: [],
  });
}

export function createReportFromTemplate(
  template: ReportData,
  property: PropertyRecord
): ReportData {
  const blank = createBlankReport(template.details.reportType, property);
  const now = new Date();
  const date = now.toISOString().slice(0, 10);

  return normalizeReport({
    ...blank,
    details: {
      ...blank.details,
      ...template.details,
      propertyAddress: property.address,
      inspectionDate: date,
      agentSignDate: date,
      coverPhotoUrl: undefined,
      coverPhotoStorageKey: undefined,
    },
    areas: template.areas.map((area) => ({
      ...area,
      id: `area-${crypto.randomUUID()}`,
      items: area.items.map((item) => ({
        ...item,
        id: `item-${crypto.randomUUID()}`,
        agentComments: '',
        actionComments: '',
        activityDate: '',
        activityTime: '',
        activityParty: '',
        status: undefined,
        dueDate: '',
        tenantComments: '',
        tenantAgrees: null,
      })),
    })),
    photos: [],
  });
}

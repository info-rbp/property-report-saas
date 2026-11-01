import {
  REPORT_TYPES,
  ReportCategory,
  ReportTemplateFamily,
  ReportType,
  TenancyDetails,
} from '../types/report';

export interface ReportFieldDefinition {
  key: keyof TenancyDetails;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
}

export interface ReportTemplateDefinition {
  type: ReportType;
  category: ReportCategory;
  family: ReportTemplateFamily;
  label: string;
  shortLabel: string;
  purpose: string;
  findingsTitle: string;
  summaryTitle: string;
  finalSectionTitle: string;
  defaultAreas: string[];
  detailFields: ReportFieldDefinition[];
  summaryFields: ReportFieldDefinition[];
  disclaimer: string;
  selectable?: boolean;
  specializedLayout?: 'building-management' | 'key-receipt';
}

const visualInspectionDisclaimer = (subject: string) =>
  `This ${subject} records visible conditions observed at the property at the time of inspection. It is a visual inspection only and is not a building, structural, electrical, plumbing, gas, pest, pool barrier, asbestos or statutory compliance inspection. Furniture, floor coverings and stored goods are not moved unless expressly noted. The report should be read together with the photographs and commentary, and specialist assessment should be obtained where required.`;

const verificationDisclaimer = (subject: string) =>
  `This ${subject} records the visible condition and information available to ProInspect at the time of attendance. It does not certify technical, statutory or trade compliance unless expressly stated. Any recommendation is based on visible observations only and specialist assessment should be obtained where required. The report should be read together with the photographs and commentary.`;

const commonDetails: ReportFieldDefinition[] = [
  { key: 'inspectionDate', label: 'Inspection / Attendance Date', placeholder: 'DD/MM/YYYY' },
  { key: 'inspectingAgent', label: 'Inspector / Prepared By' },
  { key: 'clientName', label: 'Client / Principal' },
  { key: 'referenceNumber', label: 'Reference / Work Order' },
];

const commonSignoff: ReportFieldDefinition[] = [
  { key: 'additionalComments', label: 'Additional Comments', multiline: true, rows: 4 },
  { key: 'agentSignName', label: 'Prepared / Signed By' },
  { key: 'agentSignDate', label: 'Sign-off Date', placeholder: 'DD/MM/YYYY' },
];

export const REPORT_TEMPLATES: ReportTemplateDefinition[] = [
  {
    type: 'Entry',
    category: 'Residential',
    family: 'entry',
    label: 'Entry Condition Report',
    shortLabel: 'Entry',
    purpose: 'WA residential tenancy property condition report at commencement.',
    findingsTitle: 'Property Condition',
    summaryTitle: 'Tenancy Details',
    finalSectionTitle: 'Entry Report Additional Comments',
    defaultAreas: [],
    detailFields: [],
    summaryFields: [],
    disclaimer: 'This report records the condition observed at the time of inspection. It should be read together with the photographs and commentary contained in the report.',
  },
  {
    type: 'Routine',
    category: 'Residential',
    family: 'routine',
    label: 'Routine Inspection Report',
    shortLabel: 'Routine',
    purpose: 'Periodic residential inspection recording presentation, observations and maintenance.',
    findingsTitle: 'Inspection Findings',
    summaryTitle: 'Inspection Summary',
    finalSectionTitle: 'Inspection Summary & Actions',
    defaultAreas: [],
    detailFields: [],
    summaryFields: [],
    disclaimer: visualInspectionDisclaimer('routine inspection report'),
  },
  {
    type: 'Exit',
    category: 'Residential',
    family: 'exit',
    label: 'Exit Condition Report',
    shortLabel: 'Exit',
    purpose: 'End-of-tenancy condition report with condition ratings and photographic evidence.',
    findingsTitle: 'Exit Condition',
    summaryTitle: 'Exit Inspection Details',
    finalSectionTitle: 'Special Reporting at Exit Condition Report',
    defaultAreas: [],
    detailFields: [],
    summaryFields: [],
    disclaimer: visualInspectionDisclaimer('exit condition report'),
  },
  {
    type: 'PropertyOnboarding',
    category: 'Residential',
    family: 'condition',
    label: 'Property Onboarding Condition Report',
    shortLabel: 'Property Onboarding',
    purpose: 'Baseline condition record when ProInspect first takes over a property.',
    findingsTitle: 'Baseline Property Condition',
    summaryTitle: 'Onboarding Inspection Details',
    finalSectionTitle: 'Onboarding Summary & Sign-off',
    defaultAreas: ['Exterior Front', 'Entry', 'Living Areas', 'Kitchen', 'Bedrooms', 'Bathrooms', 'Laundry', 'Exterior Rear', 'Garage / Carport', 'Gardens / Grounds'],
    detailFields: [...commonDetails, { key: 'inspectionPurpose', label: 'Onboarding / Inspection Purpose', multiline: true, rows: 3 }],
    summaryFields: [...commonSignoff],
    disclaimer: visualInspectionDisclaimer('property onboarding condition report'),
  },
  {
    type: 'VacantProperty',
    category: 'Residential',
    family: 'inspection',
    label: 'Vacant Property Inspection Report',
    shortLabel: 'Vacant Property',
    purpose: 'Inspection of an unoccupied property covering security, leaks, damage and general condition.',
    findingsTitle: 'Vacant Property Findings',
    summaryTitle: 'Vacant Property Inspection Details',
    finalSectionTitle: 'Security, Maintenance & Actions',
    defaultAreas: ['External Security', 'Entry / Access', 'Internal Rooms', 'Kitchen', 'Bathrooms / Wet Areas', 'Windows / Doors', 'Utilities / Visible Leaks', 'Gardens / Grounds', 'Garage / Outbuildings'],
    detailFields: [...commonDetails, { key: 'accessDetails', label: 'Access / Security Details', multiline: true, rows: 3 }],
    summaryFields: [
      { key: 'maintenanceComments', label: 'Maintenance / Defect Comments', multiline: true, rows: 5 },
      { key: 'actionRequired', label: 'Actions Required', multiline: true, rows: 4 },
      ...commonSignoff,
    ],
    disclaimer: visualInspectionDisclaimer('vacant property inspection report'),
  },
  {
    type: 'MaintenanceAssessment',
    category: 'Maintenance',
    family: 'maintenance',
    label: 'Maintenance Assessment Report',
    shortLabel: 'Maintenance Assessment',
    purpose: 'Document a reported issue, observed condition, urgency and recommended scope of work.',
    findingsTitle: 'Assessment Findings',
    summaryTitle: 'Maintenance Assessment Details',
    finalSectionTitle: 'Assessment, Recommendation & Sign-off',
    defaultAreas: ['Reported Issue', 'Affected Area', 'Related Building Elements'],
    detailFields: [
      ...commonDetails,
      { key: 'issueSummary', label: 'Reported Issue', multiline: true, rows: 4 },
      { key: 'siteContact', label: 'Site Contact' },
      { key: 'accessDetails', label: 'Access Details', multiline: true, rows: 3 },
    ],
    summaryFields: [
      { key: 'observedCondition', label: 'Observed Condition', multiline: true, rows: 5 },
      { key: 'urgency', label: 'Urgency / Priority' },
      { key: 'recommendedAction', label: 'Recommended Action / Scope', multiline: true, rows: 5 },
      ...commonSignoff,
    ],
    disclaimer: verificationDisclaimer('maintenance assessment report'),
  },
  {
    type: 'MaintenanceCompletion',
    category: 'Maintenance',
    family: 'maintenance',
    label: 'Maintenance Completion / Verification Report',
    shortLabel: 'Maintenance Completion',
    purpose: 'Confirm authorised maintenance has been completed and document the finished work.',
    findingsTitle: 'Completion Verification',
    summaryTitle: 'Maintenance Completion Details',
    finalSectionTitle: 'Verification Outcome & Sign-off',
    defaultAreas: ['Work Area', 'Completed Works', 'Residual / Outstanding Items'],
    detailFields: [
      ...commonDetails,
      { key: 'contractorName', label: 'Contractor / Supplier' },
      { key: 'workOrderReference', label: 'Work Order / Quote Reference' },
      { key: 'workDescription', label: 'Authorised Scope of Works', multiline: true, rows: 5 },
      { key: 'completionDate', label: 'Completion Date', placeholder: 'DD/MM/YYYY' },
    ],
    summaryFields: [
      { key: 'verificationOutcome', label: 'Verification Outcome', multiline: true, rows: 5 },
      { key: 'outstandingItems', label: 'Outstanding / Follow-up Items', multiline: true, rows: 4 },
      ...commonSignoff,
    ],
    disclaimer: verificationDisclaimer('maintenance completion and verification report'),
  },
  {
    type: 'CleaningRectification',
    category: 'Maintenance',
    family: 'maintenance',
    label: 'Cleaning / Rectification Reinspection Report',
    shortLabel: 'Rectification Reinspection',
    purpose: 'Follow-up inspection after cleaning or rectification works have been requested.',
    findingsTitle: 'Rectification Reinspection Findings',
    summaryTitle: 'Reinspection Details',
    finalSectionTitle: 'Rectification Outcome & Sign-off',
    defaultAreas: ['Items Requiring Reinspection', 'Cleaning', 'Damage / Repairs', 'Outstanding Items'],
    detailFields: [...commonDetails, { key: 'workDescription', label: 'Required Rectification / Cleaning Scope', multiline: true, rows: 5 }],
    summaryFields: [
      { key: 'verificationOutcome', label: 'Reinspection Outcome', multiline: true, rows: 5 },
      { key: 'outstandingItems', label: 'Outstanding Items', multiline: true, rows: 4 },
      ...commonSignoff,
    ],
    disclaimer: verificationDisclaimer('cleaning and rectification reinspection report'),
  },
  {
    type: 'CommercialIngoing',
    category: 'Commercial',
    family: 'condition',
    label: 'Commercial Ingoing Condition Report',
    shortLabel: 'Commercial Ingoing',
    purpose: 'Baseline condition of commercial premises at commencement of occupation or lease.',
    findingsTitle: 'Ingoing Premises Condition',
    summaryTitle: 'Commercial Ingoing Details',
    finalSectionTitle: 'Ingoing Condition Summary & Sign-off',
    defaultAreas: ['External', 'Entry / Shopfront', 'Main Premises', 'Office Areas', 'Kitchen / Staff Area', 'Amenities', 'Storage', 'Plant / Services', 'Car Parking / Loading', 'Common / Shared Access'],
    detailFields: [...commonDetails, { key: 'tenants', label: 'Tenant / Occupier' }, { key: 'tenancyStartDate', label: 'Lease / Occupation Start Date', placeholder: 'DD/MM/YYYY' }],
    summaryFields: [...commonSignoff],
    disclaimer: visualInspectionDisclaimer('commercial ingoing condition report'),
  },
  {
    type: 'CommercialPeriodic',
    category: 'Commercial',
    family: 'inspection',
    label: 'Commercial Periodic Inspection Report',
    shortLabel: 'Commercial Periodic',
    purpose: 'Periodic inspection of commercial premises covering presentation, defects and landlord matters.',
    findingsTitle: 'Commercial Inspection Findings',
    summaryTitle: 'Commercial Inspection Details',
    finalSectionTitle: 'Maintenance, Actions & Sign-off',
    defaultAreas: ['External', 'Entry / Shopfront', 'Main Premises', 'Office Areas', 'Amenities', 'Storage', 'Plant / Services', 'Car Parking / Loading', 'Common / Shared Access'],
    detailFields: [...commonDetails, { key: 'tenants', label: 'Tenant / Occupier' }, { key: 'leaseExpiryDate', label: 'Lease Expiry Date', placeholder: 'DD/MM/YYYY' }],
    summaryFields: [
      { key: 'maintenanceComments', label: 'Maintenance / Landlord Matters', multiline: true, rows: 5 },
      { key: 'actionRequired', label: 'Actions Required', multiline: true, rows: 4 },
      ...commonSignoff,
    ],
    disclaimer: visualInspectionDisclaimer('commercial periodic inspection report'),
  },
  {
    type: 'CommercialExit',
    category: 'Commercial',
    family: 'condition',
    label: 'Commercial Exit / Make-Good Report',
    shortLabel: 'Commercial Exit / Make-Good',
    purpose: 'End-of-occupation condition and make-good observations for commercial premises.',
    findingsTitle: 'Exit / Make-Good Findings',
    summaryTitle: 'Commercial Exit Details',
    finalSectionTitle: 'Make-Good Summary & Sign-off',
    defaultAreas: ['External', 'Entry / Shopfront', 'Main Premises', 'Office Areas', 'Amenities', 'Storage', 'Plant / Services', 'Car Parking / Loading', 'Common / Shared Access'],
    detailFields: [...commonDetails, { key: 'tenants', label: 'Tenant / Occupier' }, { key: 'workDescription', label: 'Known Make-Good Obligations / Scope', multiline: true, rows: 5 }],
    summaryFields: [
      { key: 'outstandingItems', label: 'Outstanding Make-Good Items', multiline: true, rows: 6 },
      { key: 'recommendedAction', label: 'Recommended Action', multiline: true, rows: 4 },
      ...commonSignoff,
    ],
    disclaimer: verificationDisclaimer('commercial exit and make-good report'),
  },
  {
    type: 'CommonProperty',
    category: 'Building / Strata',
    family: 'inspection',
    label: 'Common Property Inspection Report',
    shortLabel: 'Common Property',
    purpose: 'Inspect common property for defects, cleaning issues, safety observations and maintenance requirements.',
    findingsTitle: 'Common Property Findings',
    summaryTitle: 'Common Property Inspection Details',
    finalSectionTitle: 'Actions, Maintenance & Sign-off',
    defaultAreas: ['Building Exterior', 'Entry / Foyer', 'Lifts', 'Corridors', 'Stairwells', 'Carpark', 'Bin / Waste Areas', 'Gardens / Grounds', 'Lighting', 'Security / Access', 'Fire Equipment - Visual Observation', 'Plant / Service Areas', 'Cleaning'],
    detailFields: [...commonDetails, { key: 'buildingSummary', label: 'Building / Scheme Summary', multiline: true, rows: 4 }],
    summaryFields: [
      { key: 'maintenanceComments', label: 'Maintenance / Defect Matters', multiline: true, rows: 5 },
      { key: 'actionRequired', label: 'Actions Required', multiline: true, rows: 4 },
      { key: 'mattersForApproval', label: 'Matters Requiring Approval', multiline: true, rows: 4 },
      ...commonSignoff,
    ],
    disclaimer: visualInspectionDisclaimer('common property inspection report'),
  },
  {
    type: 'BuildingManagement',
    category: 'Building / Strata',
    family: 'operations',
    label: 'Building Management Monthly Report (Legacy)',
    shortLabel: 'Building Management',
    purpose: 'Legacy building-management report retained for compatibility with existing saved reports.',
    findingsTitle: 'Building Management Activities',
    summaryTitle: 'Building Management Reporting Period',
    finalSectionTitle: 'Operational Summary & Sign-off',
    defaultAreas: ['Building Maintenance and Repairs', 'Building Security', 'Cleaning', 'Gardening and Grounds Maintenance', 'Movements of Residents (coming and going)', 'Inductions - New Residents', 'Waste Management', 'Other', 'Leave Plans', 'Issues'],
    detailFields: [
      { key: 'buildingName', label: 'Building / Scheme Name' },
      { key: 'strataPlan', label: 'Strata Plan / Scheme Reference' },
      { key: 'reportingPeriod', label: 'Reporting Period' },
      { key: 'inspectionDate', label: 'Report Date', placeholder: 'DD/MM/YYYY' },
      { key: 'inspectingAgent', label: 'Building Manager / Prepared By' },
      { key: 'clientName', label: 'Client / Council / Principal' },
    ],
    summaryFields: [
      { key: 'buildingSummary', label: 'Overall Monthly Summary', multiline: true, rows: 5 },
      { key: 'outstandingItems', label: 'Outstanding Works / Issues', multiline: true, rows: 5 },
      { key: 'mattersForApproval', label: 'Matters Requiring Approval', multiline: true, rows: 4 },
      { key: 'recommendedAction', label: 'Planned / Next Period Actions', multiline: true, rows: 4 },
      ...commonSignoff,
    ],
    disclaimer: verificationDisclaimer('building management monthly report'),
    selectable: false,
    specializedLayout: 'building-management',
  },
  {
    type: 'BuildingManagementDaily',
    category: 'Building / Strata',
    family: 'operations',
    label: 'Building Management Daily Report',
    shortLabel: 'Building Manager Daily',
    purpose: 'Daily operational building-management record with activities, actions and item-linked photographic evidence.',
    findingsTitle: 'Daily Building Management Activities',
    summaryTitle: 'Daily Report Details',
    finalSectionTitle: 'Daily Summary, Outstanding Items & Sign-off',
    defaultAreas: ['Building Maintenance and Repairs', 'Building Security', 'Cleaning', 'Gardening and Grounds Maintenance', 'Movements of Residents (coming and going)', 'Inductions - New Residents', 'Waste Management', 'Other', 'Leave Plans', 'Issues'],
    detailFields: [
      { key: 'buildingName', label: 'Building / Scheme Name' },
      { key: 'strataPlan', label: 'Strata Plan / Scheme Reference' },
      { key: 'inspectionDate', label: 'Report Date', placeholder: 'DD/MM/YYYY' },
      { key: 'inspectingAgent', label: 'Building Manager / Prepared By' },
      { key: 'clientName', label: 'Client / Council / Principal' },
    ],
    summaryFields: [
      { key: 'buildingSummary', label: 'Daily Summary', multiline: true, rows: 5 },
      { key: 'outstandingItems', label: 'Outstanding Works / Issues', multiline: true, rows: 5 },
      { key: 'mattersForApproval', label: 'Matters Requiring Approval / Escalation', multiline: true, rows: 4 },
      ...commonSignoff,
    ],
    disclaimer: verificationDisclaimer('building management daily report'),
    specializedLayout: 'building-management',
  },
  {
    type: 'BuildingManagementMonthly',
    category: 'Building / Strata',
    family: 'operations',
    label: 'Building Management Monthly Report',
    shortLabel: 'Building Manager Monthly',
    purpose: 'Monthly operational building-management report summarising activities, actions and item-linked photographic evidence.',
    findingsTitle: 'Monthly Building Management Activities',
    summaryTitle: 'Monthly Report Details',
    finalSectionTitle: 'Monthly Summary, Outstanding Items & Sign-off',
    defaultAreas: ['Building Maintenance and Repairs', 'Building Security', 'Cleaning', 'Gardening and Grounds Maintenance', 'Movements of Residents (coming and going)', 'Inductions - New Residents', 'Waste Management', 'Other', 'Leave Plans', 'Issues'],
    detailFields: [
      { key: 'buildingName', label: 'Building / Scheme Name' },
      { key: 'strataPlan', label: 'Strata Plan / Scheme Reference' },
      { key: 'reportingPeriod', label: 'Reporting Period' },
      { key: 'inspectionDate', label: 'Report Date', placeholder: 'DD/MM/YYYY' },
      { key: 'inspectingAgent', label: 'Building Manager / Prepared By' },
      { key: 'clientName', label: 'Client / Council / Principal' },
    ],
    summaryFields: [
      { key: 'buildingSummary', label: 'Overall Monthly Summary', multiline: true, rows: 5 },
      { key: 'outstandingItems', label: 'Outstanding Works / Issues', multiline: true, rows: 5 },
      { key: 'mattersForApproval', label: 'Matters Requiring Approval', multiline: true, rows: 4 },
      { key: 'recommendedAction', label: 'Planned / Next Period Actions', multiline: true, rows: 4 },
      ...commonSignoff,
    ],
    disclaimer: verificationDisclaimer('building management monthly report'),
    specializedLayout: 'building-management',
  },
  {
    type: 'UpdatedBusinessManagement',
    category: 'Building / Strata',
    family: 'operations',
    label: 'Updated Business Management Report',
    shortLabel: 'Updated Business Management',
    purpose: 'Streamlined operational management report using broad management categories, a single combined description/action narrative and clear responsibility/status tracking.',
    findingsTitle: 'Business Management Activity Register',
    summaryTitle: 'Business Management Report Details',
    finalSectionTitle: 'Management Summary, Outstanding Items & Sign-off',
    defaultAreas: [
      'Maintenance & Assets',
      'Building Operations',
      'Security & Access',
      'Residents & Occupancy',
      'Compliance & Safety',
      'Management & Administration',
    ],
    detailFields: [
      { key: 'buildingName', label: 'Building / Scheme Name' },
      { key: 'strataPlan', label: 'Strata Plan / Scheme Reference' },
      { key: 'reportingPeriod', label: 'Reporting Period' },
      { key: 'inspectionDate', label: 'Report Date', placeholder: 'DD/MM/YYYY' },
      { key: 'inspectingAgent', label: 'Building Manager / Prepared By' },
      { key: 'clientName', label: 'Client / Council / Principal' },
    ],
    summaryFields: [
      { key: 'buildingSummary', label: 'Overall Management Summary', multiline: true, rows: 5 },
      { key: 'outstandingItems', label: 'Outstanding Works / Issues', multiline: true, rows: 5 },
      { key: 'mattersForApproval', label: 'Matters Requiring Approval', multiline: true, rows: 4 },
      { key: 'recommendedAction', label: 'Planned / Next Period Actions', multiline: true, rows: 4 },
      ...commonSignoff,
    ],
    disclaimer: verificationDisclaimer('updated business management report'),
    specializedLayout: 'building-management',
  },
  {
    type: 'Incident',
    category: 'Building / Strata',
    family: 'event',
    label: 'Incident Report',
    shortLabel: 'Incident',
    purpose: 'Record property damage, water events, accidents, security incidents or other significant events.',
    findingsTitle: 'Incident Evidence & Observations',
    summaryTitle: 'Incident Details',
    finalSectionTitle: 'Actions, Follow-up & Sign-off',
    defaultAreas: ['Incident Location', 'Affected Areas', 'Related Property / Equipment'],
    detailFields: [
      ...commonDetails,
      { key: 'incidentDate', label: 'Incident Date', placeholder: 'DD/MM/YYYY' },
      { key: 'incidentTime', label: 'Incident Time' },
      { key: 'incidentCategory', label: 'Incident Category' },
      { key: 'incidentDescription', label: 'Incident Description', multiline: true, rows: 6 },
      { key: 'siteContact', label: 'Person(s) Involved / Contact' },
    ],
    summaryFields: [
      { key: 'immediateActions', label: 'Immediate Actions Taken', multiline: true, rows: 5 },
      { key: 'recommendedAction', label: 'Follow-up / Recommended Action', multiline: true, rows: 5 },
      ...commonSignoff,
    ],
    disclaimer: verificationDisclaimer('incident report'),
  },
  {
    type: 'ContractorWorks',
    category: 'Maintenance',
    family: 'maintenance',
    label: 'Contractor Works Inspection Report',
    shortLabel: 'Contractor Works',
    purpose: 'Pre-work or post-work evidence covering access, workmanship observations and completion.',
    findingsTitle: 'Works Inspection Findings',
    summaryTitle: 'Contractor Works Details',
    finalSectionTitle: 'Works Outcome & Sign-off',
    defaultAreas: ['Work Area', 'Adjacent / Protected Areas', 'Completed Works', 'Outstanding / Defective Works'],
    detailFields: [
      ...commonDetails,
      { key: 'contractorName', label: 'Contractor / Supplier' },
      { key: 'workOrderReference', label: 'Work Order / Quote Reference' },
      { key: 'workDescription', label: 'Scope of Works', multiline: true, rows: 5 },
      { key: 'accessDetails', label: 'Access / Site Instructions', multiline: true, rows: 3 },
    ],
    summaryFields: [
      { key: 'verificationOutcome', label: 'Inspection / Workmanship Outcome', multiline: true, rows: 5 },
      { key: 'outstandingItems', label: 'Outstanding / Defective Items', multiline: true, rows: 4 },
      ...commonSignoff,
    ],
    disclaimer: verificationDisclaimer('contractor works inspection report'),
  },
  {
    type: 'PropertyHandover',
    category: 'Residential',
    family: 'event',
    label: 'Property Handover Report',
    shortLabel: 'Property Handover',
    purpose: 'Record keys, access devices, meter readings, visible condition and outstanding matters at handover.',
    findingsTitle: 'Handover Condition & Items',
    summaryTitle: 'Property Handover Details',
    finalSectionTitle: 'Handover Summary & Sign-off',
    defaultAreas: ['Property Condition', 'Keys / Access Devices', 'Meters / Utilities', 'Documents / Manuals', 'Outstanding Works'],
    detailFields: [
      ...commonDetails,
      { key: 'siteContact', label: 'Receiving / Handover Contact' },
      { key: 'keysAccessDevices', label: 'Keys / Access Devices', multiline: true, rows: 5 },
      { key: 'meterReadings', label: 'Meter Readings', multiline: true, rows: 4 },
      { key: 'accessDetails', label: 'Access / Security Notes', multiline: true, rows: 3 },
    ],
    summaryFields: [
      { key: 'outstandingItems', label: 'Outstanding Items / Works', multiline: true, rows: 5 },
      ...commonSignoff,
    ],
    disclaimer: verificationDisclaimer('property handover report'),
  },
  {
    type: 'PreventativeMaintenance',
    category: 'Maintenance',
    family: 'inspection',
    label: 'Preventative Maintenance Inspection',
    shortLabel: 'Preventative Maintenance',
    purpose: 'Scheduled inspection of property components before faults become reactive maintenance.',
    findingsTitle: 'Preventative Maintenance Findings',
    summaryTitle: 'Preventative Maintenance Inspection Details',
    finalSectionTitle: 'Maintenance Plan & Sign-off',
    defaultAreas: ['Roof / Gutters - Visual', 'External Fabric', 'Doors / Windows', 'Wet Areas', 'Plumbing - Visual', 'Electrical - Visual', 'HVAC / Ventilation - Visual', 'Grounds / Drainage', 'Safety / Access', 'Plant / Equipment'],
    detailFields: [...commonDetails, { key: 'nextReviewDate', label: 'Next Review Date', placeholder: 'DD/MM/YYYY' }],
    summaryFields: [
      { key: 'maintenanceComments', label: 'Preventative Maintenance Items', multiline: true, rows: 6 },
      { key: 'recommendedAction', label: 'Recommended Programme / Actions', multiline: true, rows: 5 },
      ...commonSignoff,
    ],
    disclaimer: visualInspectionDisclaimer('preventative maintenance inspection'),
  },
  {
    type: 'CleaningQuality',
    category: 'Maintenance',
    family: 'maintenance',
    label: 'Cleaning Quality Inspection Report',
    shortLabel: 'Cleaning Quality',
    purpose: 'Quality assurance for vacate, common-area or contractor cleaning.',
    findingsTitle: 'Cleaning Quality Findings',
    summaryTitle: 'Cleaning Inspection Details',
    finalSectionTitle: 'Cleaning Outcome & Sign-off',
    defaultAreas: ['Entry', 'Living Areas', 'Kitchen', 'Bedrooms', 'Bathrooms', 'Laundry', 'Windows / Glass', 'Floors / Carpets', 'External / Balconies', 'Common Areas'],
    detailFields: [...commonDetails, { key: 'contractorName', label: 'Cleaning Contractor' }, { key: 'workOrderReference', label: 'Booking / Work Order Reference' }],
    summaryFields: [
      { key: 'verificationOutcome', label: 'Cleaning Quality Outcome', multiline: true, rows: 5 },
      { key: 'outstandingItems', label: 'Items Requiring Rectification', multiline: true, rows: 5 },
      ...commonSignoff,
    ],
    disclaimer: verificationDisclaimer('cleaning quality inspection report'),
  },
  {
    type: 'AnnualPropertySummary',
    category: 'Residential',
    family: 'operations',
    label: 'Annual Property Condition Summary',
    shortLabel: 'Annual Property Summary',
    purpose: 'Annual high-level summary of property condition, inspections, maintenance and emerging matters.',
    findingsTitle: 'Annual Property Condition Overview',
    summaryTitle: 'Annual Summary Details',
    finalSectionTitle: 'Annual Actions & Recommendations',
    defaultAreas: ['Overall Condition', 'Internal Areas', 'External Areas', 'Maintenance History', 'Emerging Issues', 'Recommended Works'],
    detailFields: [...commonDetails, { key: 'annualSummaryPeriod', label: 'Summary Period' }, { key: 'buildingSummary', label: 'Property Overview', multiline: true, rows: 5 }],
    summaryFields: [
      { key: 'worksCompleted', label: 'Works Completed During Period', multiline: true, rows: 5 },
      { key: 'outstandingItems', label: 'Outstanding / Emerging Issues', multiline: true, rows: 5 },
      { key: 'recommendedAction', label: 'Recommended Actions for Next Period', multiline: true, rows: 5 },
      ...commonSignoff,
    ],
    disclaimer: verificationDisclaimer('annual property condition summary'),
  },
  {
    type: 'KeyReceipt',
    category: 'Residential',
    family: 'event',
    label: 'Key Receipt',
    shortLabel: 'Key Receipt',
    purpose: 'Record the handover of keys and access devices to a tenant at the commencement of a tenancy.',
    findingsTitle: 'Keys & Access Devices Received',
    summaryTitle: 'Key Handover Details',
    finalSectionTitle: 'Tenant Acknowledgement & Signature',
    defaultAreas: ['Keys / Access Devices Received'],
    detailFields: [
      { key: 'tenants', label: 'Tenant / Recipient' },
      { key: 'tenancyStartDate', label: 'Tenancy Commencement Date', placeholder: 'DD/MM/YYYY' },
      { key: 'inspectionDate', label: 'Date Keys / Access Devices Received', placeholder: 'DD/MM/YYYY' },
      { key: 'keyReceiptTime', label: 'Time Received', placeholder: 'e.g. 2:30 pm' },
      { key: 'inspectingAgent', label: 'Issued By' },
      { key: 'referenceNumber', label: 'Reference' },
    ],
    summaryFields: [
      { key: 'additionalComments', label: 'Handover Notes / Comments', multiline: true, rows: 4 },
    ],
    disclaimer:
      'This receipt records the handover of the keys and access devices listed above. It does not replace or amend the tenancy agreement, property condition report or any other tenancy document.',
    specializedLayout: 'key-receipt',
  },
  {
    type: 'Custom',
    category: 'Custom',
    family: 'operations',
    label: 'Custom Report',
    shortLabel: 'Custom',
    purpose: 'Create a flexible illustrated report with editable sections, item titles, detailed commentary and directly linked photo evidence.',
    findingsTitle: 'Report Content',
    summaryTitle: 'Custom Report Details',
    finalSectionTitle: 'Summary, Recommendations & Sign-off',
    defaultAreas: ['Report Content'],
    detailFields: [
      { key: 'formName', label: 'Report Title', placeholder: 'e.g. Special Property Inspection Report' },
      { key: 'inspectionDate', label: 'Report / Attendance Date', placeholder: 'DD/MM/YYYY' },
      { key: 'inspectingAgent', label: 'Prepared By' },
      { key: 'clientName', label: 'Client / Principal' },
      { key: 'referenceNumber', label: 'Reference' },
      { key: 'inspectionPurpose', label: 'Purpose / Background', multiline: true, rows: 5 },
    ],
    summaryFields: [
      { key: 'additionalComments', label: 'Summary / Additional Comments', multiline: true, rows: 6 },
      { key: 'recommendedAction', label: 'Recommendations / Next Steps', multiline: true, rows: 6 },
      { key: 'actionRequired', label: 'Actions Required', multiline: true, rows: 5 },
      { key: 'agentSignName', label: 'Prepared / Signed By' },
      { key: 'agentSignDate', label: 'Sign-off Date', placeholder: 'DD/MM/YYYY' },
    ],
    disclaimer: verificationDisclaimer('custom report'),
  },
  {
    type: 'KeySafeInstallation',
    category: 'Maintenance',
    family: 'event',
    label: 'Key Safe Installation Report',
    shortLabel: 'Key Safe Installation',
    purpose: 'Record the location, installation method, condition and verification of a key safe installation.',
    findingsTitle: 'Installation Evidence & Verification',
    summaryTitle: 'Key Safe Installation Details',
    finalSectionTitle: 'Installation Outcome & Sign-off',
    defaultAreas: ['Installation Location', 'Key Safe / Hardware', 'Fixing / Mounting', 'Access / Surrounding Area'],
    detailFields: [
      ...commonDetails,
      { key: 'keySafeLocation', label: 'Key Safe Location', multiline: true, rows: 3 },
      { key: 'keySafeModel', label: 'Key Safe Make / Model' },
      { key: 'installationMethod', label: 'Installation / Fixing Method', multiline: true, rows: 4 },
      { key: 'keysAccessDevices', label: 'Key / Access Device Placed in Safe', multiline: true, rows: 3 },
      { key: 'codeHandlingNote', label: 'Code Handling Note', placeholder: 'e.g. Access code recorded securely and supplied separately' },
    ],
    summaryFields: [
      { key: 'installationOutcome', label: 'Installation / Function Test Outcome', multiline: true, rows: 5 },
      { key: 'outstandingItems', label: 'Outstanding / Follow-up Items', multiline: true, rows: 4 },
      ...commonSignoff,
    ],
    disclaimer:
      'This key safe installation report records the visible installation, location and basic function check completed by ProInspect. Access codes should not be printed in this report and should be communicated and stored through an approved secure channel. The report is not a structural or locksmith certification unless expressly stated.',
  },
];

function buildReportTemplateMap(): Record<ReportType, ReportTemplateDefinition> {
  const map = {} as Record<ReportType, ReportTemplateDefinition>;
  for (const definition of REPORT_TEMPLATES) {
    if (map[definition.type]) {
      throw new Error(`Duplicate report template definition: ${definition.type}`);
    }

    const areaKeys = new Set<string>();
    for (const area of definition.defaultAreas) {
      const key = area.trim().toLowerCase();
      if (!key) throw new Error(`Blank default area in report template: ${definition.type}`);
      if (areaKeys.has(key)) {
        throw new Error(`Duplicate default area "${area}" in report template: ${definition.type}`);
      }
      areaKeys.add(key);
    }

    map[definition.type] = definition;
  }

  const missing = REPORT_TYPES.filter((type) => !map[type]);
  if (missing.length) {
    throw new Error(`Missing report template definition(s): ${missing.join(', ')}`);
  }

  return map;
}

export const REPORT_TEMPLATE_MAP = buildReportTemplateMap();

export function getReportTemplate(type: ReportType): ReportTemplateDefinition {
  const template = REPORT_TEMPLATE_MAP[type];
  if (!template) throw new Error(`Unknown report template: ${String(type)}`);
  return template;
}

const MAINTENANCE_REGISTER_REPORT_TYPES = new Set<ReportType>([
  'Entry',
  'Routine',
  'Exit',
  'PropertyOnboarding',
  'VacantProperty',
  'CommercialIngoing',
  'CommercialPeriodic',
  'CommercialExit',
  'CommonProperty',
  'BuildingManagement',
  'BuildingManagementDaily',
  'BuildingManagementMonthly',
  'UpdatedBusinessManagement',
  'PropertyHandover',
  'AnnualPropertySummary',
  'Custom',
]);

export function supportsMaintenanceRegister(reportType: ReportType): boolean {
  return MAINTENANCE_REGISTER_REPORT_TYPES.has(reportType);
}

export function supportsItemActionTracking(reportType: ReportType): boolean {
  const family = getReportTemplate(reportType).family;
  return ['inspection', 'maintenance', 'operations', 'event'].includes(family);
}

export function isBuildingManagementTemplate(type: ReportType): boolean {
  return getReportTemplate(type).specializedLayout === 'building-management';
}

export function isKeyReceiptTemplate(type: ReportType): boolean {
  return getReportTemplate(type).specializedLayout === 'key-receipt';
}

export const REPORT_CATEGORIES: ReportCategory[] = [
  'Residential',
  'Commercial',
  'Maintenance',
  'Building / Strata',
  'Custom',
];

export function reportLabel(type: ReportType): string {
  return getReportTemplate(type).label;
}

export function reportInstanceLabel(details: Pick<TenancyDetails, 'reportType' | 'formName'>): string {
  const customTitle = details.reportType === 'Custom' ? details.formName?.trim() : '';
  return customTitle || reportLabel(details.reportType);
}

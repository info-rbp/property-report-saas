// Catalogue names verified against the source repository, not the outdated README count.
export const REPORT_TYPES = Object.freeze({
    Entry: 'Entry Condition Report', Routine: 'Routine Inspection Report', Exit: 'Exit Condition Report', PropertyOnboarding: 'Property Onboarding Condition Report', VacantProperty: 'Vacant Property Inspection Report', PropertyHandover: 'Property Handover Report', AnnualPropertySummary: 'Annual Property Condition Summary', KeyReceipt: 'Key Receipt',
    CommercialIngoing: 'Commercial Ingoing Condition Report', CommercialPeriodic: 'Commercial Periodic Inspection Report', CommercialExit: 'Commercial Exit / Make-Good Report',
    MaintenanceAssessment: 'Maintenance Assessment Report', MaintenanceCompletion: 'Maintenance Completion / Verification Report', CleaningRectification: 'Cleaning / Rectification Reinspection Report', ContractorWorks: 'Contractor Works Inspection Report', PreventativeMaintenance: 'Preventative Maintenance Inspection', CleaningQuality: 'Cleaning Quality Inspection Report', KeySafeInstallation: 'Key Safe Installation Report',
    CommonProperty: 'Common Property Inspection Report', BuildingManagementDaily: 'Building Management Daily Report', BuildingManagementMonthly: 'Building Management Monthly Report', UpdatedBusinessManagement: 'Updated Business Management Report', Incident: 'Incident Report', Custom: 'Custom Report'
});
export const DEFAULT_AREAS = Object.freeze({
    Routine: ['Exterior', 'Entry', 'Living areas', 'Kitchen', 'Bedrooms', 'Bathrooms', 'Laundry', 'Grounds'],
    BuildingManagementDaily: ['Building Maintenance and Repairs', 'Building Security', 'Cleaning', 'Gardening and Grounds Maintenance', 'Movements of Residents', 'Inductions', 'Waste Management', 'Other', 'Leave Plans', 'Issues'],
    BuildingManagementMonthly: ['Building Maintenance and Repairs', 'Building Security', 'Cleaning', 'Gardening and Grounds Maintenance', 'Movements of Residents', 'Inductions', 'Waste Management', 'Other', 'Leave Plans', 'Issues'],
    UpdatedBusinessManagement: ['Maintenance & Assets', 'Building Operations', 'Security & Access', 'Residents & Occupancy', 'Compliance & Safety', 'Management & Administration']
});

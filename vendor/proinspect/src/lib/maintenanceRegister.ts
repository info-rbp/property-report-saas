import type { InspectionArea, InspectionItem, ReportData, ReportPhoto } from '../types/report';

export interface MaintenanceRegisterEntry {
  area: InspectionArea;
  item: InspectionItem;
  photos: ReportPhoto[];
}

export function maintenanceRegisterEntries(report: ReportData): MaintenanceRegisterEntry[] {
  return report.areas.flatMap((area) =>
    area.items
      .filter((item) => item.maintenanceRequired)
      .map((item) => ({
        area,
        item,
        photos: report.photos
          .filter((photo) => photo.itemId === item.id)
          .sort((a, b) => (a.photoIndex || 0) - (b.photoIndex || 0)),
      }))
  );
}

export function maintenanceNarrative(item: InspectionItem): string {
  return (item.maintenanceCommentary || '').trim() || (item.agentComments || '').trim();
}

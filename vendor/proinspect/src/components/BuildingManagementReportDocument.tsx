import React from 'react';
import { PROINSPECT_COMPANY } from '../config/company';
import { getReportTemplate } from '../data/reportCatalogue';
import { formatAustralianDate, normalizeAreaName } from '../lib/reportFormatting';
import { InspectionArea, InspectionItem, ReportData } from '../types/report';
import { ProInspectLogo } from './ProInspectLogo';
import { MaintenanceRegisterPreview } from './MaintenanceRegisterPreview';

interface Props {
  report: ReportData;
}

function Footer() {
  return (
    <div className="mt-auto border-t border-neutral-200 pt-2 text-[9px] text-neutral-500 flex justify-between">
      <span className="font-bold text-[#0a2540]">ProInspect</span>
      <span>INSPECT. REPORT. PROTECT.</span>
    </div>
  );
}

function Header({ report, title }: { report: ReportData; title: string }) {
  return (
    <div className="flex justify-between border-b border-neutral-300 pb-2 mb-4 text-[10px] font-bold text-neutral-700">
      <span>{report.details.propertyAddress || 'Building / site address not recorded'}</span>
      <span>{title}</span>
    </div>
  );
}

function itemPhotos(report: ReportData, itemId: string) {
  return report.photos
    .filter((photo) => photo.itemId === itemId)
    .sort((a, b) => (a.photoIndex || 0) - (b.photoIndex || 0));
}

function itemPhotoCount(report: ReportData, itemId: string): number {
  return itemPhotos(report, itemId).length;
}

function ItemPhotos({ report, item }: { report: ReportData; item: InspectionItem }) {
  const photos = itemPhotos(report, item.id);
  if (!photos.length) return null;

  return (
    <div className="border-x border-b border-neutral-300 bg-neutral-50 px-3 py-3">
      <div className="text-[8px] font-extrabold uppercase tracking-wide text-[#0a2540] mb-2">
        Photo evidence — {item.name || 'Reporting item'}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo, index) => (
          <div key={photo.id} className="border border-neutral-200 bg-white flex flex-col min-w-0">
            <div className="px-1.5 py-1 text-[8px] font-bold leading-tight">
              Photo {index + 1} of {photos.length}
            </div>
            <div className="h-[42mm] bg-neutral-50 flex items-center justify-center overflow-hidden">
              {photo.dataUrl || photo.url ? (
                <img
                  src={photo.dataUrl || photo.url}
                  alt={photo.name}
                  className="block max-w-full max-h-full object-contain"
                  loading="lazy"
                />
              ) : (
                <span className="text-[8px] text-neutral-400">Image unavailable</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryPhotos({ report, area }: { report: ReportData; area: InspectionArea }) {
  const areaKey = normalizeAreaName(area.name);
  const photos = report.photos
    .filter((photo) => !photo.itemId && normalizeAreaName(photo.areaName) === areaKey)
    .sort((a, b) => (a.photoIndex || 0) - (b.photoIndex || 0));
  if (!photos.length) return null;

  return (
    <div className="border-x border-b border-neutral-300 bg-cyan-50/40 px-3 py-3">
      <div className="text-[8px] font-extrabold uppercase tracking-wide text-[#0a2540] mb-2">
        Category-level photo evidence — {area.name}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo, index) => (
          <div key={photo.id} className="border border-neutral-200 bg-white flex flex-col min-w-0">
            <div className="px-1.5 py-1 text-[8px] font-bold leading-tight">
              Photo {index + 1} of {photos.length}
            </div>
            <div className="h-[42mm] bg-neutral-50 flex items-center justify-center overflow-hidden">
              {photo.dataUrl || photo.url ? (
                <img
                  src={photo.dataUrl || photo.url}
                  alt={photo.name}
                  className="block max-w-full max-h-full object-contain"
                  loading="lazy"
                />
              ) : (
                <span className="text-[8px] text-neutral-400">Image unavailable</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ItemRows({
  report,
  area,
  daily,
  inlinePhotos,
  updatedLayout,
}: {
  report: ReportData;
  area: InspectionArea;
  daily: boolean;
  inlinePhotos: boolean;
  updatedLayout: boolean;
}) {
  if (!area.items.length) {
    return (
      <div className="border-x border-b border-neutral-300 p-3 text-[9px] italic text-neutral-500">
        No activity recorded in this category for the reporting period.
      </div>
    );
  }

  return (
    <>
      {area.items.map((item: InspectionItem) => (
        <React.Fragment key={item.id}>
          {updatedLayout ? (
            <div className="border-x border-b border-neutral-300 text-[8px]">
              <div className="grid grid-cols-[24mm_1fr_42mm_28mm_27mm_12mm] bg-neutral-50 border-b border-neutral-200">
                <div className="p-2 border-r border-neutral-200 font-bold">{formatAustralianDate(item.activityDate) || 'Date not recorded'}</div>
                <div className="p-2 border-r border-neutral-200 font-bold">{item.name || 'Untitled item'}</div>
                <div className="p-2 border-r border-neutral-200">{item.activityParty || 'Not assigned'}</div>
                <div className="p-2 border-r border-neutral-200 font-bold">{item.status || 'Open'}</div>
                <div className="p-2 border-r border-neutral-200">{formatAustralianDate(item.dueDate) || 'No due date'}</div>
                <div className="p-2 text-center font-bold text-cyan-700">{itemPhotoCount(report, item.id)}</div>
              </div>
              <div className="p-2 whitespace-pre-wrap min-h-[14mm]">
                <div className="text-[7px] font-bold uppercase text-neutral-500 mb-1">Description / Action</div>
                {item.agentComments || 'No description / action recorded.'}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-[38mm_32mm_1fr_44mm_12mm] border-x border-b border-neutral-300 text-[8px]">
              <div className="p-2 border-r border-neutral-200 whitespace-pre-wrap">
                <div className="font-bold">{daily ? item.activityTime || 'Time not recorded' : formatAustralianDate(item.activityDate) || 'Date not recorded'}</div>
                {item.activityParty && <div className="mt-1">{item.activityParty}</div>}
              </div>
              <div className="p-2 border-r border-neutral-200 font-bold">{item.name || 'Untitled reporting item'}</div>
              <div className="p-2 border-r border-neutral-200 whitespace-pre-wrap">{item.agentComments || 'No activity summary recorded.'}</div>
              <div className="p-2 border-r border-neutral-200 whitespace-pre-wrap">{item.actionComments || 'No further action recorded.'}</div>
              <div className="p-2 text-center font-bold text-cyan-700">{itemPhotoCount(report, item.id)}</div>
            </div>
          )}
          {inlinePhotos && <ItemPhotos report={report} item={item} />}
        </React.Fragment>
      ))}
    </>
  );
}

function CategoryPage({
  report,
  area,
  daily,
  inlinePhotos,
  updatedLayout,
}: {
  report: ReportData;
  area: InspectionArea;
  daily: boolean;
  inlinePhotos: boolean;
  updatedLayout: boolean;
}) {
  return (
    <div className="pdf-page w-[210mm] min-h-[297mm] bg-white p-[12mm] flex flex-col shadow-2xl box-border">
      <Header report={report} title={getReportTemplate(report.details.reportType).shortLabel} />
      <div className="bg-slate-100 border border-neutral-300 px-3 py-2 text-sm font-extrabold text-[#0a2540]">
        {area.name}
      </div>
      {inlinePhotos && <CategoryPhotos report={report} area={area} />}
      {updatedLayout ? (
        <div className="grid grid-cols-[24mm_1fr_42mm_28mm_27mm_12mm] bg-neutral-50 border-x border-b border-neutral-300 text-[7px] font-bold">
          <div className="p-2 border-r border-neutral-300 text-center">Date</div>
          <div className="p-2 border-r border-neutral-300 text-center">Item</div>
          <div className="p-2 border-r border-neutral-300 text-center">Responsible Party</div>
          <div className="p-2 border-r border-neutral-300 text-center">Status</div>
          <div className="p-2 border-r border-neutral-300 text-center">Due Date</div>
          <div className="p-2 text-center">Photos</div>
        </div>
      ) : (
        <div className="grid grid-cols-[38mm_32mm_1fr_44mm_12mm] bg-neutral-50 border-x border-b border-neutral-300 text-[8px] font-bold">
          <div className="p-2 border-r border-neutral-300 text-center">{daily ? 'Time / Party' : 'Date / Party'}</div>
          <div className="p-2 border-r border-neutral-300 text-center">Reporting Item</div>
          <div className="p-2 border-r border-neutral-300 text-center">
            {daily ? 'Brief Summary of Activities Today' : 'Brief Summary of Activities within this period'}
          </div>
          <div className="p-2 border-r border-neutral-300 text-center">Actions</div>
          <div className="p-2 text-center">Photos</div>
        </div>
      )}
      <ItemRows report={report} area={area} daily={daily} inlinePhotos={inlinePhotos} updatedLayout={updatedLayout} />
      <Footer />
    </div>
  );
}

function PhotoPages({ report }: { report: ReportData }) {
  if (!report.photos.length) return null;

  const areaOrder = new Map(report.areas.map((area, index) => [normalizeAreaName(area.name), index]));
  const itemOrder = new Map<string, number>();
  report.areas.forEach((area) => area.items.forEach((item, index) => itemOrder.set(item.id, index)));

  const ordered = [...report.photos].sort((a, b) => {
    const areaDiff =
      (areaOrder.get(normalizeAreaName(a.areaName)) ?? Number.MAX_SAFE_INTEGER) -
      (areaOrder.get(normalizeAreaName(b.areaName)) ?? Number.MAX_SAFE_INTEGER);
    if (areaDiff) return areaDiff;
    const itemDiff =
      (a.itemId ? itemOrder.get(a.itemId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER) -
      (b.itemId ? itemOrder.get(b.itemId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER);
    if (itemDiff) return itemDiff;
    return (a.photoIndex || 0) - (b.photoIndex || 0);
  });

  const pages = Array.from({ length: Math.ceil(ordered.length / 12) }, (_, index) =>
    ordered.slice(index * 12, (index + 1) * 12)
  );

  return (
    <>
      {pages.map((page, pageIndex) => (
        <div key={pageIndex} className="pdf-page w-[210mm] min-h-[297mm] bg-white p-[12mm] flex flex-col shadow-2xl box-border">
          <Header report={report} title="Building Manager Photo Evidence" />
          {pageIndex === 0 && (
            <div className="bg-slate-100 border border-neutral-300 px-3 py-2 text-sm font-extrabold text-[#0a2540] mb-3">
              Item-linked Photo Evidence ({ordered.length} photos)
            </div>
          )}
          <div className="grid grid-cols-3 grid-rows-4 gap-2 flex-1 min-h-0">
            {page.map((photo) => {
              const currentItem = photo.itemId
                ? report.areas.flatMap((area) => area.items).find((item) => item.id === photo.itemId)
                : undefined;
              return (
              <div key={photo.id} className="border border-neutral-200 flex flex-col min-w-0">
                <div className="px-1.5 py-1 text-[8px] font-bold leading-tight">
                  {photo.areaName || 'Category'} — {currentItem?.name || photo.itemName || 'Category-level photo'}
                </div>
                <div className="bg-neutral-50 flex-1 min-h-0 flex items-center justify-center overflow-hidden">
                  {photo.dataUrl || photo.url ? (
                    <img
                      src={photo.dataUrl || photo.url}
                      alt={photo.name}
                      className="block max-w-full max-h-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-[8px] text-neutral-400">Image unavailable</span>
                  )}
                </div>
              </div>
              );
            })}
          </div>
          <Footer />
        </div>
      ))}
    </>
  );
}

export const BuildingManagementReportDocument: React.FC<Props> = ({ report }) => {
  const template = getReportTemplate(report.details.reportType);
  const daily = report.details.reportType === 'BuildingManagementDaily';
  const monthlyPilot = report.details.reportType === 'BuildingManagementMonthly';
  const updatedBusinessManagement = report.details.reportType === 'UpdatedBusinessManagement';
  const inlinePhotos = monthlyPilot || updatedBusinessManagement;
  const cover = report.photos.find((photo) => photo.isCover) || report.photos[0];
  const coverSource = report.details.coverPhotoUrl || cover?.dataUrl || cover?.url;
  const coverName = report.details.coverPhotoUrl ? 'Report cover' : cover?.name || 'Report cover';
  const details = report.details;

  const summaryRows = daily
    ? [
        ['Daily Summary', details.buildingSummary],
        ['Outstanding Works / Issues', details.outstandingItems],
        ['Matters Requiring Approval / Escalation', details.mattersForApproval],
        ['Additional Comments', details.additionalComments],
      ]
    : updatedBusinessManagement
    ? [
        ['Overall Management Summary', details.buildingSummary],
        ['Outstanding Works / Issues', details.outstandingItems],
        ['Matters Requiring Approval', details.mattersForApproval],
        ['Planned / Next Period Actions', details.recommendedAction],
        ['Additional Comments', details.additionalComments],
      ]
    : [
        ['Overall Monthly Summary', details.buildingSummary],
        ['Outstanding Works / Issues', details.outstandingItems],
        ['Matters Requiring Approval', details.mattersForApproval],
        ['Planned / Next Period Actions', details.recommendedAction],
        ['Additional Comments', details.additionalComments],
      ];

  return (
    <div id="report-print-container" className="flex flex-col items-center gap-8 bg-neutral-200/80 p-4 md:p-8">
      <div className="pdf-page w-[210mm] min-h-[297mm] bg-white p-[18mm] flex flex-col shadow-2xl box-border">
        <div className="flex justify-between items-start">
          <ProInspectLogo size="md" showTagline />
          <div className="text-right text-xs text-neutral-600 leading-relaxed">
            <p className="font-bold text-[#0a2540]">{details.companyName || PROINSPECT_COMPANY.name}</p>
            <p>{details.companyAddress || PROINSPECT_COMPANY.address}</p>
            <p>{details.companyPhone || PROINSPECT_COMPANY.phone}</p>
            <p>{details.companyEmail || PROINSPECT_COMPANY.email}</p>
          </div>
        </div>

        <div className="mt-20 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight">{template.label}</h1>
          {details.buildingName && <p className="mt-4 text-xl font-bold text-[#0a2540]">{details.buildingName}</p>}
          {details.strataPlan && <p className="mt-1 text-sm font-semibold text-neutral-600">{details.strataPlan}</p>}
          <p className="mt-2 text-base font-bold text-neutral-800">{details.propertyAddress || 'Building / Site Address'}</p>
          <p className="mt-3 text-sm text-neutral-600">
            {daily ? formatAustralianDate(details.inspectionDate) : details.reportingPeriod || 'Reporting period not recorded'}
          </p>
        </div>

        <div className="mt-10 w-[140mm] h-[85mm] mx-auto overflow-hidden rounded border border-neutral-300 bg-neutral-50 flex items-center justify-center">
          {coverSource ? (
            <img src={coverSource} alt={coverName} className="max-w-full max-h-full object-contain" />
          ) : (
            <div className="text-center text-neutral-400 text-xs">
              <div className="font-bold text-[#0a2540]">ProInspect</div>
              <div>No cover photo selected</div>
            </div>
          )}
        </div>

        <div className="mt-auto text-center space-y-1 mb-8">
          <p className="font-semibold text-sm">Prepared by {details.inspectingAgent || 'Not recorded'}</p>
          <p className="text-xs text-neutral-500">{details.clientName || ''}</p>
        </div>
        <Footer />
      </div>

      <div className="pdf-page w-[210mm] min-h-[297mm] bg-white p-[12mm] flex flex-col shadow-2xl box-border">
        <Header report={report} title={template.shortLabel} />
        <div className="bg-slate-100 border border-neutral-300 px-3 py-2 text-sm font-extrabold text-[#0a2540]">
          {template.summaryTitle}
        </div>
        {[
          ['Building / Scheme Name', details.buildingName],
          ['Strata Plan / Scheme Reference', details.strataPlan],
          ['Building / Site Address', details.propertyAddress],
          [daily ? 'Report Date' : 'Reporting Period', daily ? formatAustralianDate(details.inspectionDate) : details.reportingPeriod],
          ...(!daily ? [['Report Issue Date', formatAustralianDate(details.inspectionDate)] as [string, string | undefined]] : []),
          ['Building Manager / Prepared By', details.inspectingAgent],
          ['Client / Council / Principal', details.clientName],
        ].map(([label, value]) => (
          <div key={label} className="grid grid-cols-[55mm_1fr] border-x border-b border-neutral-300 text-[10px]">
            <div className="bg-neutral-50 p-2 font-bold">{label}</div>
            <div className="p-2">{value || 'Not recorded'}</div>
          </div>
        ))}
        <Footer />
      </div>

      {report.areas.map((area) => (
        <CategoryPage key={area.id} report={report} area={area} daily={daily} inlinePhotos={inlinePhotos} updatedLayout={updatedBusinessManagement} />
      ))}

      {!inlinePhotos && <PhotoPages report={report} />}

      <div className="pdf-page w-[210mm] min-h-[297mm] bg-white p-[12mm] flex flex-col shadow-2xl box-border">
        <Header report={report} title={template.shortLabel} />
        <div className="bg-slate-100 border border-neutral-300 px-3 py-2 text-sm font-extrabold text-[#0a2540]">
          {template.finalSectionTitle}
        </div>
        <div className="mt-3 space-y-3">
          {summaryRows.map(([label, value]) => (
            <div key={label} className="border border-neutral-300">
              <div className="bg-neutral-50 border-b border-neutral-300 px-2 py-1.5 text-[9px] font-bold">{label}</div>
              <div className="p-2 min-h-[14mm] whitespace-pre-wrap text-[9px]">{value || 'No comments recorded.'}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 border border-neutral-300">
          <div className="bg-slate-100 border-b border-neutral-300 px-3 py-2 text-xs font-extrabold text-[#0a2540]">
            Building Manager / Prepared by
          </div>
          <div className="grid grid-cols-3 min-h-[18mm] text-[10px]">
            <div className="p-3 border-r"><strong>Print Name</strong><br />{details.agentSignName || details.inspectingAgent || 'Not recorded'}</div>
            <div className="p-3 border-r"><strong>Signature</strong><br /><span className="italic">{details.agentSignName || details.inspectingAgent}</span></div>
            <div className="p-3"><strong>Date</strong><br />{formatAustralianDate(details.agentSignDate || details.inspectionDate)}</div>
          </div>
        </div>

        <div className="mt-5">
          <div className="text-[10px] font-extrabold">DISCLAIMER:</div>
          <p className="mt-1 text-[9px] italic text-neutral-500">{details.disclaimerText}</p>
        </div>
        <Footer />
      </div>

      <MaintenanceRegisterPreview report={report} />
    </div>
  );
};

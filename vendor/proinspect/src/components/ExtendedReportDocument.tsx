import React from 'react';
import { PROINSPECT_COMPANY } from '../config/company';
import { getReportTemplate, ReportFieldDefinition } from '../data/reportCatalogue';
import { formatAustralianDate, normalizeAreaName } from '../lib/reportFormatting';
import { ReportData, TenancyDetails } from '../types/report';
import { ProInspectLogo } from './ProInspectLogo';
import { MaintenanceRegisterPreview } from './MaintenanceRegisterPreview';
import { CustomReportContentPages } from './CustomReportContentPages';

interface Props {
  report: ReportData;
}

function fieldValue(details: TenancyDetails, field: ReportFieldDefinition): string {
  const raw = details[field.key];
  const value = typeof raw === 'string' ? raw : '';
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
  return dateKeys.has(String(field.key)) ? formatAustralianDate(value) : value;
}

function Header({ report, title }: { report: ReportData; title: string }) {
  return (
    <div className="flex justify-between border-b border-neutral-300 pb-2 mb-4 text-[10px] font-bold text-neutral-700">
      <span>{report.details.propertyAddress || 'Property / site address not recorded'}</span>
      <span>{title}</span>
    </div>
  );
}

function Footer() {
  return (
    <div className="mt-auto border-t border-neutral-200 pt-2 text-[9px] text-neutral-500 flex justify-between">
      <span className="font-bold text-[#0a2540]">ProInspect</span>
      <span>INSPECT. REPORT. PROTECT.</span>
    </div>
  );
}

function PhotoPreviewPages({ report }: { report: ReportData }) {
  if (!report.photos.length) return null;

  const areaOrder = new Map(report.areas.map((area, index) => [normalizeAreaName(area.name), index]));
  const ordered = [...report.photos].sort((a, b) => {
    const aArea = normalizeAreaName(a.areaName || 'General');
    const bArea = normalizeAreaName(b.areaName || 'General');
    const order = (areaOrder.get(aArea) ?? Number.MAX_SAFE_INTEGER) - (areaOrder.get(bArea) ?? Number.MAX_SAFE_INTEGER);
    if (order) return order;
    return (a.photoIndex || 0) - (b.photoIndex || 0);
  });

  const totals = new Map<string, number>();
  ordered.forEach((photo) => {
    const key = normalizeAreaName(photo.areaName || 'General');
    totals.set(key, (totals.get(key) || 0) + 1);
  });
  const ordinals = new Map<string, number>();
  const pages = Array.from({ length: Math.ceil(ordered.length / 12) }, (_, index) =>
    ordered.slice(index * 12, (index + 1) * 12)
  );

  return (
    <>
      {pages.map((page, pageIndex) => (
        <div key={pageIndex} className="pdf-page w-[210mm] min-h-[297mm] bg-white p-[12mm] flex flex-col shadow-2xl box-border">
          <Header report={report} title="Inspection Photos" />
          {pageIndex === 0 && (
            <div className="bg-slate-100 border border-neutral-300 px-3 py-2 text-sm font-extrabold text-[#0a2540] mb-3">
              Report Photos ({ordered.length} photos)
            </div>
          )}
          <div className="grid grid-cols-3 grid-rows-4 gap-2 flex-1 min-h-0">
            {page.map((photo) => {
              const key = normalizeAreaName(photo.areaName || 'General');
              const ordinal = (ordinals.get(key) || 0) + 1;
              ordinals.set(key, ordinal);
              return (
                <div key={photo.id} className="border border-neutral-200 min-w-0 flex flex-col">
                  <div className="px-1.5 py-1 text-[8px] font-bold leading-tight">
                    {photo.areaName || 'General'}: Overall (photo {ordinal} of {totals.get(key) || 1})
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

export const ExtendedReportDocument: React.FC<Props> = ({ report }) => {
  const template = getReportTemplate(report.details.reportType);
  const cover = report.photos.find((photo) => photo.isCover) || report.photos[0];
  const coverSource = report.details.coverPhotoUrl || cover?.dataUrl || cover?.url;
  const coverName = report.details.coverPhotoUrl ? 'Report cover' : cover?.name || 'Report cover';
  const conditionFamily = template.family === 'condition';
  const isCustomReport = report.details.reportType === 'Custom';
  const displayTitle =
    report.details.reportType === 'Custom' && report.details.formName?.trim()
      ? report.details.formName.trim()
      : template.label;

  return (
    <div id="report-print-container" className="flex flex-col items-center gap-8 bg-neutral-200/80 p-4 md:p-8">
      <div className="pdf-page w-[210mm] min-h-[297mm] bg-white p-[18mm] flex flex-col shadow-2xl box-border">
        <div className="flex justify-between items-start">
          <ProInspectLogo size="md" showTagline />
          <div className="text-right text-xs text-neutral-600 leading-relaxed">
            <p className="font-bold text-[#0a2540]">{report.details.companyName || PROINSPECT_COMPANY.name}</p>
            <p>{report.details.companyAddress || PROINSPECT_COMPANY.address}</p>
            <p>{report.details.companyPhone || PROINSPECT_COMPANY.phone}</p>
            <p>{report.details.companyEmail || PROINSPECT_COMPANY.email}</p>
          </div>
        </div>

        <div className="mt-24 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight">{displayTitle}</h1>
          <p className="mt-4 text-xl font-bold text-[#0a2540]">{report.details.propertyAddress || 'Property / Site Address'}</p>
        </div>

        <div className="mt-12 w-[140mm] h-[85mm] mx-auto overflow-hidden rounded border border-neutral-300 bg-neutral-50 flex items-center justify-center">
          {coverSource ? (
            <img src={coverSource} alt={coverName} className="max-w-full max-h-full object-contain" />
          ) : (
            <div className="text-center text-neutral-400 text-xs">
              <div className="font-bold text-[#0a2540]">ProInspect</div>
              <div>No cover photo selected</div>
            </div>
          )}
        </div>

        <div className="mt-auto text-center space-y-1.5 mb-8">
          <p className="font-semibold text-sm">Report completed on {formatAustralianDate(report.details.inspectionDate) || 'Not recorded'}</p>
          <p className="text-sm text-neutral-600">Prepared by {report.details.inspectingAgent || 'Not recorded'}</p>
        </div>
        <Footer />
      </div>

      <div className="pdf-page w-[210mm] min-h-[297mm] bg-white p-[12mm] flex flex-col shadow-2xl box-border">
        <Header report={report} title={template.shortLabel} />
        <div className="bg-slate-100 border border-neutral-300 px-3 py-2 text-sm font-extrabold text-[#0a2540]">
          {template.summaryTitle}
        </div>
        <div className="border-x border-b border-neutral-300">
          <div className="grid grid-cols-[52mm_1fr] border-b border-neutral-200 text-[10px]">
            <div className="bg-slate-50 px-2 py-1.5 font-bold">Property / Site Address</div>
            <div className="px-2 py-1.5">{report.details.propertyAddress || 'Not recorded'}</div>
          </div>
          {template.detailFields.map((field) => (
            <div key={String(field.key)} className="grid grid-cols-[52mm_1fr] border-b last:border-b-0 border-neutral-200 text-[10px]">
              <div className="bg-slate-50 px-2 py-1.5 font-bold">{field.label}</div>
              <div className="px-2 py-1.5 whitespace-pre-wrap">{fieldValue(report.details, field) || 'Not recorded'}</div>
            </div>
          ))}
        </div>

        {!isCustomReport && (
          <>
        <div className="mt-5 bg-slate-100 border border-neutral-300 px-3 py-2 text-sm font-extrabold text-[#0a2540]">
          {template.findingsTitle}
        </div>

        <div className="mt-2 space-y-3">
          {report.areas.slice(0, 8).map((area) => {
            const photos = report.photos.filter((photo) => normalizeAreaName(photo.areaName) === normalizeAreaName(area.name)).length;
            return (
              <div key={area.id} className="border border-neutral-300">
                <div className="bg-slate-100 px-2 py-1.5 border-b border-neutral-300 flex justify-between text-[10px]">
                  <span className="font-extrabold">{area.name.toUpperCase()}</span>
                  <span className="font-bold text-cyan-700">{photos} {photos === 1 ? 'photo' : 'photos'}</span>
                </div>
                <div className={conditionFamily ? 'grid grid-cols-[40mm_8mm_8mm_8mm_1fr] bg-neutral-50 text-[8px] font-bold' : 'grid grid-cols-[42mm_1fr] bg-neutral-50 text-[8px] font-bold'}>
                  <div className="p-1.5 border-r border-neutral-300">Item</div>
                  {conditionFamily && <>
                    <div className="p-1.5 text-center border-r">Cln</div>
                    <div className="p-1.5 text-center border-r">Udg</div>
                    <div className="p-1.5 text-center border-r">Wkg</div>
                  </>}
                  <div className="p-1.5">{conditionFamily ? 'Condition commentary' : 'Finding / observation'}</div>
                </div>
                {area.items.slice(0, 4).map((item) => (
                  <div key={item.id} className={conditionFamily ? 'grid grid-cols-[40mm_8mm_8mm_8mm_1fr] border-t border-neutral-200 text-[8px]' : 'grid grid-cols-[42mm_1fr] border-t border-neutral-200 text-[8px]'}>
                    <div className="p-1.5 border-r font-bold">{item.name}</div>
                    {conditionFamily && <>
                      <div className="p-1.5 text-center border-r">{item.clean == null ? '' : item.clean ? 'Y' : 'N'}</div>
                      <div className="p-1.5 text-center border-r">{item.undamaged == null ? '' : item.undamaged ? 'Y' : 'N'}</div>
                      <div className="p-1.5 text-center border-r">{item.working == null ? '' : item.working ? 'Y' : 'N'}</div>
                    </>}
                    <div className="p-1.5 whitespace-pre-wrap">
                      {item.agentComments || 'No observation recorded.'}
                      {(item.activityParty || item.status || item.dueDate) && (
                        <div className="mt-1.5 pt-1.5 border-t border-neutral-200 text-[7px] text-neutral-600">
                          <strong>Responsible:</strong> {item.activityParty || 'Not assigned'} &nbsp;•&nbsp;
                          <strong>Status:</strong> {item.status || 'Open'} &nbsp;•&nbsp;
                          <strong>Due:</strong> {formatAustralianDate(item.dueDate) || 'No due date'}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
          </>
        )}
        <Footer />
      </div>

      {isCustomReport && <CustomReportContentPages report={report} />}

      <div className="pdf-page w-[210mm] min-h-[297mm] bg-white p-[12mm] flex flex-col shadow-2xl box-border">
        <Header report={report} title={template.shortLabel} />
        <div className="bg-slate-100 border border-neutral-300 px-3 py-2 text-sm font-extrabold text-[#0a2540]">
          {template.finalSectionTitle}
        </div>
        <div className="mt-3 space-y-3">
          {template.summaryFields
            .filter((field) => !['agentSignName', 'agentSignDate'].includes(String(field.key)))
            .map((field) => (
              <div key={String(field.key)} className="border border-neutral-300">
                <div className="bg-slate-50 border-b border-neutral-300 px-2 py-1.5 text-[9px] font-bold">{field.label}</div>
                <div className="p-2 min-h-[12mm] whitespace-pre-wrap text-[9px]">{fieldValue(report.details, field) || 'Not recorded'}</div>
              </div>
            ))}
        </div>

        <div className="mt-4 border border-neutral-300">
          <div className="bg-slate-100 border-b border-neutral-300 px-3 py-2 text-xs font-extrabold text-[#0a2540]">Prepared by / Report sign-off</div>
          <div className="grid grid-cols-3 min-h-[18mm] text-[10px]">
            <div className="p-3 border-r"><strong>Print Name</strong><br />{report.details.agentSignName || report.details.inspectingAgent || 'Not recorded'}</div>
            <div className="p-3 border-r"><strong>Signature</strong><br /><span className="italic">{report.details.agentSignName || report.details.inspectingAgent}</span></div>
            <div className="p-3"><strong>Date</strong><br />{formatAustralianDate(report.details.agentSignDate || report.details.inspectionDate)}</div>
          </div>
        </div>

        <div className="mt-5">
          <div className="text-[10px] font-extrabold">DISCLAIMER:</div>
          <p className="mt-1 text-[9px] italic text-neutral-500">{report.details.disclaimerText}</p>
        </div>
        <Footer />
      </div>

      {!isCustomReport && <PhotoPreviewPages report={report} />}
      <MaintenanceRegisterPreview report={report} />
    </div>
  );
};

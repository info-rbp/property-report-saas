import React from 'react';
import { PROINSPECT_COMPANY } from '../config/company';
import { formatAustralianDate, normalizeAreaName } from '../lib/reportFormatting';
import { InspectionArea, ReportData } from '../types/report';
import { ProInspectLogo } from './ProInspectLogo';
import { MaintenanceRegisterPreview } from './MaintenanceRegisterPreview';

interface Props {
  report: ReportData;
}

function displayTitle(reportType: ReportData['details']['reportType']): string {
  return reportType === 'Exit'
    ? 'Residential Tenancy Exit Condition Report'
    : 'Routine Inspection Report';
}

function photoCount(report: ReportData, area: InspectionArea): number {
  const key = normalizeAreaName(area.name);
  return report.photos.filter((photo) => normalizeAreaName(photo.areaName) === key).length;
}

function PreviewHeader({ report, title }: { report: ReportData; title: string }) {
  return (
    <div className="flex justify-between border-b border-neutral-300 pb-2 mb-4 text-[10px] font-bold text-neutral-700">
      <span>{report.details.propertyAddress || 'Property address not recorded'}</span>
      <span>{title}</span>
    </div>
  );
}

function PreviewFooter() {
  return (
    <div className="mt-auto border-t border-neutral-200 pt-2 text-[9px] text-neutral-500 flex justify-between">
      <span className="font-bold text-[#0a2540]">ProInspect</span>
      <span>INSPECT. REPORT. PROTECT.</span>
    </div>
  );
}

function CoverPage({ report }: { report: ReportData }) {
  const { details, photos } = report;
  const cover = photos.find((photo) => photo.isCover) || photos[0];
  const coverSource = details.coverPhotoUrl || cover?.dataUrl || cover?.url;
  const coverName = details.coverPhotoUrl ? 'Report cover' : cover?.name || 'Report cover';
  return (
    <div className="pdf-page w-[210mm] min-h-[297mm] bg-white text-neutral-900 p-[18mm] flex flex-col shadow-2xl box-border">
      <div className="flex justify-between items-start">
        <ProInspectLogo size="md" showTagline={true} />
        <div className="text-right text-xs text-neutral-600 leading-relaxed">
          <p className="font-bold text-[#0a2540]">{details.companyName || PROINSPECT_COMPANY.name}</p>
          {(details.companyAddress || PROINSPECT_COMPANY.address) && <p>{details.companyAddress || PROINSPECT_COMPANY.address}</p>}
          {(details.companyPhone || PROINSPECT_COMPANY.phone) && <p>{details.companyPhone || PROINSPECT_COMPANY.phone}</p>}
          {(details.companyEmail || PROINSPECT_COMPANY.email) && <p>{details.companyEmail || PROINSPECT_COMPANY.email}</p>}
          {(details.companyWebsite || PROINSPECT_COMPANY.website) && (
            <p>{(details.companyWebsite || PROINSPECT_COMPANY.website).replace(/^https?:\/\//, '')}</p>
          )}
        </div>
      </div>

      <div className="mt-24 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">{displayTitle(details.reportType)}</h1>
        <p className="mt-4 text-xl font-bold text-[#0a2540]">{details.propertyAddress || 'Property address'}</p>
      </div>

      <div className="mt-12 w-[140mm] h-[85mm] mx-auto overflow-hidden rounded border border-neutral-300 bg-neutral-50 flex items-center justify-center">
        {coverSource ? (
          <img
            src={coverSource}
            alt={coverName}
            className="w-full h-full object-contain"
            crossOrigin="anonymous"
          />
        ) : (
          <div className="text-center text-neutral-400 text-xs">
            <div className="font-bold text-[#0a2540]">ProInspect</div>
            <div>No cover photo selected</div>
          </div>
        )}
      </div>

      <div className="mt-auto text-center space-y-1.5 mb-8">
        <p className="font-semibold text-sm">
          Report completed on {formatAustralianDate(details.inspectionDate) || 'Not recorded'}
        </p>
        <p className="text-sm text-neutral-600">
          Prepared by {details.inspectingAgent || 'Not recorded'}
        </p>
      </div>
      <PreviewFooter />
    </div>
  );
}

function RoutineFindingsPreview({ report }: { report: ReportData }) {
  const { details, areas } = report;
  const metadata = [
    ['Inspection Completed On', formatAustralianDate(details.inspectionDate)],
    ['Property Manager / Inspector', details.inspectingAgent],
    ['Lease Start Date', formatAustralianDate(details.tenancyStartDate)],
    ['Lease Expiry Date', formatAustralianDate(details.leaseExpiryDate)],
    ['Rent Review', formatAustralianDate(details.rentReviewDate)],
    ['Current Rental Amount', details.currentRentalAmount],
    ['Tenant/s', details.tenants],
  ];

  return (
    <div className="pdf-page w-[210mm] min-h-[297mm] bg-white text-neutral-900 p-[12mm] shadow-2xl box-border flex flex-col">
      <PreviewHeader report={report} title="Routine Inspection Report" />

      <div className="border border-neutral-300">
        <div className="bg-slate-100 border-b border-neutral-300 px-3 py-2 text-sm font-extrabold text-[#0a2540]">
          Inspection Summary
        </div>
        {metadata.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[52mm_1fr] border-b last:border-b-0 border-neutral-200 text-[10px]">
            <div className="bg-slate-50 px-2 py-1.5 font-bold">{label}</div>
            <div className="px-2 py-1.5">{value || 'Not recorded'}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 bg-slate-100 border border-neutral-300 px-3 py-2 text-sm font-extrabold text-[#0a2540]">
        Inspection Findings
      </div>

      <div className="mt-2 space-y-3">
        {areas.slice(0, 8).map((area) => (
          <div key={area.id} className="border border-neutral-300">
            <div className="bg-slate-100 px-2 py-1.5 border-b border-neutral-300 flex justify-between gap-3 text-[10px]">
              <span className="font-extrabold">{area.name.toUpperCase()}</span>
              <span className="font-bold text-cyan-700">
                {photoCount(report, area)} {photoCount(report, area) === 1 ? 'photo' : 'photos'}
              </span>
            </div>
            <div className="grid grid-cols-[42mm_1fr] bg-neutral-50 border-b border-neutral-300 text-[9px] font-bold">
              <div className="px-2 py-1.5 border-r border-neutral-300">Item</div>
              <div className="px-2 py-1.5">Inspection findings</div>
            </div>
            {(area.items.length ? area.items : [{ id: area.id + '-empty', name: 'Overall', agentComments: 'No inspection finding recorded.' }])
              .slice(0, 4)
              .map((item) => (
                <div key={item.id} className="grid grid-cols-[42mm_1fr] border-b last:border-b-0 border-neutral-200 text-[9px]">
                  <div className="px-2 py-1.5 border-r border-neutral-200 font-bold">{item.name || 'Overall'}</div>
                  <div className="px-2 py-1.5 whitespace-pre-wrap">{item.agentComments || 'No finding recorded.'}</div>
                </div>
              ))}
          </div>
        ))}
        {areas.length > 8 && (
          <div className="text-[9px] text-neutral-500 italic">
            Preview continues in the issued PDF for {areas.length - 8} further inspection areas.
          </div>
        )}
      </div>

      <PreviewFooter />
    </div>
  );
}

function RoutineSummaryPreview({ report }: { report: ReportData }) {
  const { details } = report;
  return (
    <div className="pdf-page w-[210mm] min-h-[297mm] bg-white text-neutral-900 p-[12mm] shadow-2xl box-border flex flex-col">
      <PreviewHeader report={report} title="Routine Inspection Report" />
      <div className="bg-slate-100 border border-neutral-300 px-3 py-2 text-sm font-extrabold text-[#0a2540]">
        Inspection Summary & Actions
      </div>

      <div className="mt-4 border border-neutral-300">
        <div className="bg-slate-100 border-b border-neutral-300 px-3 py-2 text-xs font-extrabold text-[#0a2540]">
          Agent Comments
        </div>
        <div className="min-h-[42mm] p-3 text-[10px] whitespace-pre-wrap">
          {details.additionalComments || 'No comments recorded.'}
        </div>
      </div>

      <div className="mt-4 border border-neutral-300">
        <div className="bg-slate-100 border-b border-neutral-300 px-3 py-2 text-xs font-extrabold text-red-700">
          Maintenance Comments
        </div>
        <div className="min-h-[50mm] p-3 text-[10px] whitespace-pre-wrap">
          {details.maintenanceComments || 'No maintenance comments recorded.'}
        </div>
      </div>

      <div className="mt-5 border border-neutral-300">
        <div className="bg-slate-100 border-b border-neutral-300 px-3 py-2 text-xs font-extrabold text-[#0a2540]">
          Prepared by / Report sign-off
        </div>
        <div className="grid grid-cols-3 min-h-[18mm] text-[10px]">
          <div className="p-3 border-r border-neutral-300"><strong>Print Name</strong><br />{details.agentSignName || details.inspectingAgent || 'Not recorded'}</div>
          <div className="p-3 border-r border-neutral-300"><strong>Signature</strong><br /><span className="italic">{details.agentSignName || details.inspectingAgent}</span></div>
          <div className="p-3"><strong>Date</strong><br />{formatAustralianDate(details.agentSignDate || details.inspectionDate)}</div>
        </div>
      </div>

      <div className="mt-6">
        <div className="text-[10px] font-extrabold">DISCLAIMER:</div>
        <p className="mt-1 text-[9px] italic text-neutral-500">{details.disclaimerText}</p>
      </div>
      <PreviewFooter />
    </div>
  );
}

function ExitAreaPreview({ report, area }: { report: ReportData; area: InspectionArea }) {
  const items = area.items.length
    ? area.items
    : [{ id: area.id + '-empty', name: 'Overall', clean: null, undamaged: null, working: null, agentComments: 'No condition commentary recorded.' }];

  return (
    <div className="pdf-page w-[210mm] min-h-[297mm] bg-white text-neutral-900 p-[12mm] shadow-2xl box-border flex flex-col">
      <PreviewHeader report={report} title="Exit Condition Report" />

      <div className="border border-neutral-300 bg-neutral-50 px-3 py-2 text-center">
        <div className="font-extrabold text-xs text-[#0a2540]">Agent section</div>
        <div className="text-[8px] text-neutral-600 mt-1">
          Each item records whether it was clean, undamaged and working at the exit inspection. Y = yes, N = no.
        </div>
      </div>

      <div className="mt-3 border border-neutral-300">
        <div className="grid grid-cols-[42mm_8mm_8mm_8mm_1fr] bg-slate-100 text-[9px] font-extrabold border-b border-neutral-300">
          <div className="p-2 border-r border-neutral-300">{area.name.toUpperCase()}</div>
          <div className="p-2 border-r border-neutral-300 text-center">Cln</div>
          <div className="p-2 border-r border-neutral-300 text-center">Udg</div>
          <div className="p-2 border-r border-neutral-300 text-center">Wkg</div>
          <div className="p-2 text-center">Agent comments</div>
        </div>

        {photoCount(report, area) > 0 && (
          <div className="grid grid-cols-[42mm_24mm_1fr] border-b border-neutral-200 text-[9px]">
            <div className="p-2 font-bold border-r border-neutral-200">Overall</div>
            <div className="border-r border-neutral-200" />
            <div className="p-2 text-cyan-700">
              {photoCount(report, area)} photos - see photo gallery
            </div>
          </div>
        )}

        {items.map((item) => (
          <div key={item.id} className="grid grid-cols-[42mm_8mm_8mm_8mm_1fr] border-b last:border-b-0 border-neutral-200 text-[9px]">
            <div className="p-2 font-bold border-r border-neutral-200">{item.name}</div>
            {[item.clean, item.undamaged, item.working].map((state, index) => (
              <div
                key={index}
                className={`p-2 text-center font-extrabold border-r border-neutral-200 ${state === false ? 'text-red-700' : ''}`}
              >
                {state === null || state === undefined ? '' : state ? 'Y' : 'N'}
              </div>
            ))}
            <div className="p-2 whitespace-pre-wrap">{item.agentComments}</div>
          </div>
        ))}
      </div>
      <PreviewFooter />
    </div>
  );
}

function ExitClosingPreview({ report }: { report: ReportData }) {
  const { details } = report;
  const workDates = [
    ['Painting of premises (external)', details.paintingPremisesExternalDate],
    ['Painting of premises (internal)', details.paintingPremisesInternalDate],
    ['Floorcoverings laid', details.floorcoveringsLaidDate],
    ['Floorcoverings professionally cleaned', details.floorcoveringsCleanedDate],
  ];

  return (
    <div className="pdf-page w-[210mm] min-h-[297mm] bg-white text-neutral-900 p-[12mm] shadow-2xl box-border flex flex-col">
      <PreviewHeader report={report} title="Exit Condition Report" />
      <div className="bg-slate-100 border border-neutral-300 px-3 py-2 text-sm font-extrabold text-[#0a2540]">
        Special Reporting at Exit Condition Report
      </div>

      <h3 className="mt-5 text-xs font-extrabold">Approximate dates when work last done on residential premises</h3>
      <div className="mt-2 border border-neutral-300">
        {workDates.map(([label, date]) => (
          <div key={label} className="grid grid-cols-[1fr_52mm] text-[10px] border-b last:border-b-0 border-neutral-200">
            <div className="p-2">{label}</div>
            <div className="p-2 bg-neutral-50 text-center">{formatAustralianDate(date) || '/ /'}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 border border-neutral-300">
        <div className="bg-slate-100 border-b border-neutral-300 px-3 py-2 text-xs font-extrabold text-[#0a2540]">
          Exit Report Additional Comments
        </div>
        <div className="min-h-[55mm] p-3 text-[10px] whitespace-pre-wrap">
          {details.additionalComments || 'No comments recorded.'}
        </div>
      </div>

      <div className="mt-5 border border-neutral-300">
        <div className="bg-slate-100 border-b border-neutral-300 px-3 py-2 text-xs font-extrabold text-[#0a2540]">
          Agent Signature at the END of the Tenancy
        </div>
        <div className="grid grid-cols-3 min-h-[18mm] text-[10px]">
          <div className="p-3 border-r border-neutral-300"><strong>Print Name</strong><br />{details.agentSignName || details.inspectingAgent || 'Not recorded'}</div>
          <div className="p-3 border-r border-neutral-300"><strong>Signature</strong><br /><span className="italic">{details.agentSignName || details.inspectingAgent}</span></div>
          <div className="p-3"><strong>Date</strong><br />{formatAustralianDate(details.agentSignDate || details.inspectionDate)}</div>
        </div>
      </div>

      <div className="mt-6">
        <div className="text-[10px] font-extrabold">DISCLAIMER:</div>
        <p className="mt-1 text-[9px] italic text-neutral-500">{details.disclaimerText}</p>
      </div>
      <PreviewFooter />
    </div>
  );
}

function PhotoPreviewPages({ report }: { report: ReportData }) {
  const orderedPhotos = [...report.photos].sort((a, b) => {
    const areaOrder = new Map(report.areas.map((area, index) => [normalizeAreaName(area.name), index]));
    const aArea = normalizeAreaName(a.areaName || 'General');
    const bArea = normalizeAreaName(b.areaName || 'General');
    const order = (areaOrder.get(aArea) ?? Number.MAX_SAFE_INTEGER) - (areaOrder.get(bArea) ?? Number.MAX_SAFE_INTEGER);
    if (order) return order;
    return (a.photoIndex || 0) - (b.photoIndex || 0);
  });
  const totals = new Map<string, number>();
  orderedPhotos.forEach((photo) => {
    const key = normalizeAreaName(photo.areaName || 'General');
    totals.set(key, (totals.get(key) || 0) + 1);
  });
  const ordinals = new Map<string, number>();

  const pages = Array.from({ length: Math.ceil(orderedPhotos.length / 12) }, (_, i) =>
    orderedPhotos.slice(i * 12, (i + 1) * 12)
  );

  return (
    <>
      {pages.map((page, pageIndex) => (
        <div key={pageIndex} className="pdf-page w-[210mm] min-h-[297mm] bg-white text-neutral-900 p-[12mm] shadow-2xl box-border flex flex-col">
          <PreviewHeader report={report} title="Inspection Photos" />
          {pageIndex === 0 && (
            <div className="bg-slate-100 border border-neutral-300 px-3 py-2 text-sm font-extrabold text-[#0a2540] mb-3">
              Agent Inspection Photos ({orderedPhotos.length} photos)
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
          <PreviewFooter />
        </div>
      ))}
    </>
  );
}

export const SimpleReportDocument: React.FC<Props> = ({ report }) => {
  const isRoutine = report.details.reportType === 'Routine';

  return (
    <div id="report-print-container" className="flex flex-col items-center gap-8 bg-neutral-200/80 p-4 md:p-8">
      <CoverPage report={report} />

      {isRoutine ? (
        <>
          <RoutineFindingsPreview report={report} />
          <RoutineSummaryPreview report={report} />
        </>
      ) : (
        <>
          {report.areas.map((area) => (
            <ExitAreaPreview key={area.id} report={report} area={area} />
          ))}
        </>
      )}

      <PhotoPreviewPages report={report} />

      {!isRoutine && <ExitClosingPreview report={report} />}
      <MaintenanceRegisterPreview report={report} />
    </div>
  );
};

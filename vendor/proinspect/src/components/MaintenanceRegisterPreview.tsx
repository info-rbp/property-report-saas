import React from 'react';
import { maintenanceNarrative, maintenanceRegisterEntries } from '../lib/maintenanceRegister';
import { formatAustralianDate } from '../lib/reportFormatting';
import type { ReportData } from '../types/report';

export const MaintenanceRegisterPreview: React.FC<{ report: ReportData }> = ({ report }) => {
  const entries = maintenanceRegisterEntries(report);
  if (!entries.length) return null;

  const pages = Array.from({ length: Math.ceil(entries.length / 4) }, (_, index) =>
    entries.slice(index * 4, (index + 1) * 4)
  );

  return (
    <>
      {pages.map((page, pageIndex) => (
        <div
          key={pageIndex}
          className="pdf-page w-[210mm] min-h-[297mm] bg-white p-[12mm] flex flex-col shadow-2xl box-border"
        >
          <div className="flex justify-between border-b border-neutral-300 pb-2 mb-4 text-[10px] font-bold text-neutral-700">
            <span>{report.details.propertyAddress || 'Property / site address not recorded'}</span>
            <span>Maintenance Register</span>
          </div>

          <div className="bg-amber-50 border border-amber-300 px-3 py-2 text-sm font-extrabold text-amber-900">
            Maintenance
          </div>
          <p className="mt-2 text-[9px] text-neutral-600">
            Items flagged for maintenance during preparation of this report.
          </p>

          <div className="mt-3 space-y-3">
            {page.map(({ area, item, photos }) => (
              <div key={item.id} className="border border-neutral-300 rounded overflow-hidden">
                <div className="grid grid-cols-[34mm_1fr_38mm] bg-neutral-50 border-b border-neutral-300 text-[8px]">
                  <div className="p-2 border-r border-neutral-200">
                    <div className="text-neutral-500 uppercase font-bold">Source</div>
                    <div className="font-bold mt-1">{area.name}</div>
                  </div>
                  <div className="p-2 border-r border-neutral-200">
                    <div className="text-neutral-500 uppercase font-bold">Maintenance Item</div>
                    <div className="font-bold mt-1">{item.name}</div>
                  </div>
                  <div className="p-2">
                    <div className="text-neutral-500 uppercase font-bold">Tracking</div>
                    <div className="mt-1">{item.status || 'Open'}</div>
                    {item.activityParty && <div>{item.activityParty}</div>}
                    {item.dueDate && <div>Due {formatAustralianDate(item.dueDate)}</div>}
                  </div>
                </div>
                <div className="p-2 text-[9px] whitespace-pre-wrap">
                  {maintenanceNarrative(item) || 'Maintenance commentary not recorded.'}
                </div>
                {photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 p-2 bg-neutral-50 border-t border-neutral-200">
                    {photos.slice(0, 3).map((photo) => (
                      <div key={photo.id} className="h-[34mm] border border-neutral-200 bg-white flex items-center justify-center overflow-hidden">
                        {photo.dataUrl || photo.url ? (
                          <img src={photo.dataUrl || photo.url} alt={photo.name} className="max-w-full max-h-full object-contain" />
                        ) : (
                          <span className="text-[8px] text-neutral-400">Image unavailable</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-auto border-t border-neutral-200 pt-2 text-[9px] text-neutral-500 flex justify-between">
            <span className="font-bold text-[#0a2540]">ProInspect</span>
            <span>Maintenance register preview</span>
          </div>
        </div>
      ))}
    </>
  );
};

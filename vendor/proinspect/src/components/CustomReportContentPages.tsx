import React from 'react';
import { buildCustomReportPreviewPages } from '../lib/customReportPreview';
import type { ReportData } from '../types/report';

export const CustomReportContentPages: React.FC<{ report: ReportData }> = ({ report }) => {
  const pages = buildCustomReportPreviewPages(report);

  return (
    <>
      {pages.map((blocks, pageIndex) => (
        <div
          key={pageIndex}
          className="pdf-page w-[210mm] min-h-[297mm] h-[297mm] bg-white p-[12mm] flex flex-col shadow-2xl box-border overflow-hidden"
        >
          <div className="flex justify-between border-b border-neutral-300 pb-2 mb-4 text-[10px] font-bold text-neutral-700">
            <span>{report.details.propertyAddress || 'Property / site address not recorded'}</span>
            <span>{report.details.formName || 'Custom Report'}</span>
          </div>
          {pageIndex === 0 && (
            <div className="bg-slate-100 border border-neutral-300 px-3 py-2 text-sm font-extrabold text-[#0a2540] mb-3">
              Report Content
            </div>
          )}

          <div className="space-y-3">
            {blocks.map((block, index) => (
              <div key={`${pageIndex}-${index}`} className="border border-neutral-300">
                <div className="bg-slate-100 px-2 py-1.5 border-b border-neutral-300 text-[10px] font-extrabold text-[#0a2540] uppercase">
                  {block.areaName}
                </div>
                <div className="px-2 py-2 bg-neutral-50 border-b border-neutral-200 text-[10px] font-bold">
                  {block.itemName}{block.continuation ? ' (continued)' : ''}
                </div>
                {block.commentary && (
                  <div className="p-2 text-[9px] leading-relaxed whitespace-pre-wrap break-words">
                    <div className="mb-1 text-[8px] font-bold uppercase text-neutral-500">Commentary</div>
                    {block.commentary}
                  </div>
                )}
                {block.photos.length > 0 && (
                  <div className="px-2 pb-2">
                    <div className="pt-1 pb-1 text-[8px] font-bold uppercase text-cyan-800">
                      Photo Evidence
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {block.photos.map((photo) => (
                        <div key={photo.id} className="border border-neutral-200">
                          <div className="h-[43mm] flex items-center justify-center bg-neutral-50 overflow-hidden">
                            {photo.dataUrl || photo.url ? (
                              <img
                                src={photo.dataUrl || photo.url}
                                alt={photo.name || block.itemName}
                                className="max-h-full max-w-full object-contain"
                                loading="lazy"
                              />
                            ) : (
                              <span className="text-[8px] text-neutral-400">Photo unavailable</span>
                            )}
                          </div>
                          <div className="p-1 text-[8px] text-neutral-600 truncate">
                            {photo.name || 'Photo evidence'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-auto border-t border-neutral-200 pt-2 text-[9px] text-neutral-500 flex justify-between">
            <span className="font-bold text-[#0a2540]">ProInspect</span>
            <span>Custom Report Content · {pageIndex + 1} / {pages.length}</span>
          </div>
        </div>
      ))}
    </>
  );
};

import React from 'react';
import { PROINSPECT_COMPANY } from '../config/company';
import { ReportData, InspectionArea, InspectionItem } from '../types/report';
import { isBuildingManagementTemplate, isKeyReceiptTemplate } from '../data/reportCatalogue';
import { ProInspectLogo } from './ProInspectLogo';
import { KeyReceiptDocument } from './KeyReceiptDocument';
import { BuildingManagementReportDocument } from './BuildingManagementReportDocument';
import { ExtendedReportDocument } from './ExtendedReportDocument';
import { SimpleReportDocument } from './SimpleReportDocument';
import { MaintenanceRegisterPreview } from './MaintenanceRegisterPreview';

interface ReportPreviewProps {
  report: ReportData;
}

interface AreaPageSegment {
  area: InspectionArea;
  items: InspectionItem[];
  continuation: boolean;
}

function wrappedLineCount(value: string | undefined, charsPerLine: number): number {
  if (!value?.trim()) return 1;
  return value
    .split(/\r?\n/)
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.trim().length / charsPerLine)), 0);
}

function estimatedItemHeightMm(item: InspectionItem): number {
  const lines = Math.max(
    wrappedLineCount(item.name, 22),
    wrappedLineCount(item.agentComments, 52),
    wrappedLineCount(item.tenantComments, 34)
  );
  return 4.5 + Math.max(0, lines - 1) * 3.2;
}

function paginateInspectionAreas(areas: InspectionArea[]): AreaPageSegment[] {
  const pages: AreaPageSegment[] = [];
  // Allows for the running header, table headings, area heading, optional photo row and footer.
  const itemHeightBudgetMm = 190;

  for (const area of areas) {
    let pageItems: InspectionItem[] = [];
    let usedHeightMm = 0;
    let segmentIndex = 0;

    const pushPage = () => {
      pages.push({
        area,
        items: pageItems,
        continuation: segmentIndex > 0,
      });
      segmentIndex += 1;
      pageItems = [];
      usedHeightMm = 0;
    };

    for (const item of area.items) {
      const itemHeightMm = estimatedItemHeightMm(item);
      if (pageItems.length > 0 && usedHeightMm + itemHeightMm > itemHeightBudgetMm) {
        pushPage();
      }
      pageItems.push(item);
      usedHeightMm += itemHeightMm;
    }

    if (pageItems.length > 0 || area.items.length === 0) {
      pushPage();
    }
  }

  return pages;
}

export const ReportDocument: React.FC<ReportPreviewProps> = ({ report }) => {
  const { details, areas, photos } = report;
  const coverPhoto =
    details.coverPhotoUrl ||
    photos.find((photo) => photo.isCover)?.dataUrl ||
    photos.find((photo) => photo.isCover)?.url ||
    photos[0]?.dataUrl ||
    photos[0]?.url;

  if (details.reportType !== 'Entry') {
    if (isKeyReceiptTemplate(details.reportType)) {
      return <KeyReceiptDocument report={report} />;
    }
    if (isBuildingManagementTemplate(details.reportType)) {
      return <BuildingManagementReportDocument report={report} />;
    }
    return ['Routine', 'Exit'].includes(details.reportType)
      ? <SimpleReportDocument report={report} />
      : <ExtendedReportDocument report={report} />;
  }

  // Total inspection photos
  const totalPhotos = photos.length;

  // Keep each inspection area on its own page sequence and split long areas by estimated row height.
  // This avoids overflow/clipping when imported commentary is substantially longer than average.
  const areaPages = paginateInspectionAreas(areas);

  // Photo pages: 12 photos per page (3 columns x 4 rows) as per WA sample
  const photosPerPage = 12;
  const photoPages: typeof photos[] = [];
  for (let i = 0; i < photos.length; i += photosPerPage) {
    photoPages.push(photos.slice(i, i + photosPerPage));
  }

  // Calculate total pages
  // Page 1: Cover Page
  // Page 2: WA FORM 1 Statutory Instructions & Tenancy Details
  // Next N pages: Inspection Condition Tables (with Running Header & Footer)
  // Next M pages: Photos (3x4 grid)
  // Final 1 page: Additional Comments, Work Done Dates, Signatures & Disclaimer
  const totalPages =
    1 + // Cover
    1 + // WA Form 1 Instructions & Tenancy Details (Page 2)
    areaPages.length +
    photoPages.length +
    1; // Final Signatures & Work Done Dates

  let pageCounter = 1;

  // Helper for footer initials
  const renderInitialsFooter = (currentPage: number) => (
    <div className="flex justify-between items-center text-[10px] border-t border-neutral-300 pt-2 font-medium mt-auto">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-neutral-800">Tenant's Initial(s):</span>
        <span className="border border-neutral-400 px-3 py-0.5 rounded bg-white">1.</span>
        <span className="border border-neutral-400 px-3 py-0.5 rounded bg-white">2.</span>
        <span className="border border-neutral-400 px-3 py-0.5 rounded bg-white">3.</span>
        <span className="border border-neutral-400 px-3 py-0.5 rounded bg-white">
          Date &nbsp;&nbsp; / &nbsp;&nbsp; /
        </span>
      </div>
      <div className="font-bold text-neutral-700 font-mono text-[11px]">
        {currentPage} / {totalPages}
      </div>
    </div>
  );

  return (
    <div id="report-print-container" className="flex flex-col items-center gap-8 bg-neutral-200/80 p-4 md:p-8">
      {/* ================= PAGE 1: COVER PAGE ================= */}
      <div className="pdf-page w-[210mm] min-h-[297mm] h-[297mm] bg-white text-neutral-900 p-[18mm] flex flex-col justify-between shadow-2xl relative box-border overflow-hidden select-text">
        <div>
          {/* Top header with Company Details */}
          <div className="flex justify-between items-start">
            <ProInspectLogo size="md" showTagline={true} />

            <div className="text-right text-xs text-neutral-700 leading-snug space-y-0.5 font-medium">
              <p className="font-bold text-[#0a2540] text-sm">{details.companyName || PROINSPECT_COMPANY.name}</p>
              {(details.companyAddress || PROINSPECT_COMPANY.address) && <p>{details.companyAddress || PROINSPECT_COMPANY.address}</p>}
              {(details.companyPhone || PROINSPECT_COMPANY.phone) && (
                <p className="font-semibold text-neutral-800">{details.companyPhone || PROINSPECT_COMPANY.phone}</p>
              )}
              {(details.companyEmail || PROINSPECT_COMPANY.email) && (
                <p>
                  <span className="text-neutral-500 font-normal">Email: </span>
                  <a
                    href={`mailto:${details.companyEmail || PROINSPECT_COMPANY.email}`}
                    className="text-[#0891b2] hover:underline font-semibold"
                  >
                    {details.companyEmail || PROINSPECT_COMPANY.email}
                  </a>
                </p>
              )}
              {(details.companyWebsite || PROINSPECT_COMPANY.website) && (
                <p>{(details.companyWebsite || PROINSPECT_COMPANY.website).replace(/^https?:\/\//, '')}</p>
              )}
            </div>
          </div>

          {/* Title and Address */}
          <div className="mt-28 text-center">
            <h2 className="text-2xl md:text-3xl font-extrabold text-neutral-900 tracking-tight">
              Residential Tenancy {details.reportType} Condition Report
            </h2>
            <div className="mt-4 inline-block bg-neutral-900 text-white font-bold text-lg md:text-xl px-6 py-2.5 rounded-lg shadow-xs">
              {details.propertyAddress || 'Property address not recorded'}
            </div>
          </div>

          {/* Cover Hero Photo (if available) or Spacer */}
          <div className="mt-14 flex justify-center">
            <div className="w-[140mm] h-[85mm] bg-neutral-100 border border-neutral-300 rounded shadow-xs overflow-hidden flex items-center justify-center">
              {coverPhoto ? (
                <img
                  src={coverPhoto}
                  alt="Property exterior"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center text-neutral-400">
                  <div className="font-bold text-sm text-[#0a2540]">ProInspect</div>
                  <div className="text-[10px] mt-1">No cover photo selected</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Details */}
        <div className="text-center space-y-2 mb-6">
          <p className="text-sm font-semibold text-neutral-800">
            Report completed on {details.inspectionDate || 'Not recorded'}
          </p>
          <p className="text-sm text-neutral-600 font-medium">
            Prepared by {details.inspectingAgent || 'Not recorded'}
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center text-[10px] text-neutral-500 border-t border-neutral-200 pt-3">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="font-bold text-[#0a2540]">{details.companyName || PROINSPECT_COMPANY.name}</span>
            <span className="text-neutral-300">•</span>
            <span>INSPECT. REPORT. PROTECT.</span>
          </div>
          <span className="font-semibold text-neutral-700">{details.companyName || PROINSPECT_COMPANY.name}</span>
        </div>
      </div>

      {/* ================= PAGE 2: STATUTORY INSTRUCTIONS & TENANCY DETAILS (WA FORM 1) ================= */}
      {(() => {
        pageCounter = 2;
        return (
          <div className="pdf-page w-[210mm] min-h-[297mm] h-[297mm] bg-white text-neutral-900 p-[12mm] flex flex-col justify-between shadow-2xl relative box-border overflow-hidden select-text text-[10px] leading-tight">
            <div>
              {/* WA Government Consumer Protection Header */}
              <div className="flex justify-between items-start border-b border-neutral-900 pb-2">
                <div className="flex items-center gap-2.5">
                  {/* Western Australia Government emblem stylized badge */}
                  <div className="border border-neutral-700 px-2 py-1 rounded bg-neutral-50 text-[9px] font-bold leading-tight">
                    <div className="text-neutral-800 font-black">Government of Western Australia</div>
                    <div className="text-[8px] text-neutral-600 font-medium">
                      Department of Local Government, Industry Regulation and Safety
                    </div>
                    <div className="text-[8px] text-neutral-700 font-semibold">Consumer Protection</div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-base font-black text-neutral-900 tracking-tight">FORM 1</div>
                  <h3 className="text-sm font-extrabold text-neutral-900">Property Condition Report</h3>
                  <div className="text-[8.5px] font-bold text-neutral-700 uppercase tracking-wider">
                    RESIDENTIAL TENANCIES ACT 1987 (WA) Section 27C(6)
                  </div>
                </div>
              </div>

              {/* Instructions text */}
              <div className="mt-2.5 space-y-2 text-neutral-800 text-[9.5px]">
                <div>
                  <h4 className="font-extrabold text-neutral-900 uppercase tracking-wider text-[10px] mb-1">
                    HOW TO COMPLETE THIS FORM
                  </h4>
                  <ol className="list-decimal pl-4 space-y-1 text-justify">
                    <li>
                      Before the tenancy begins, the lessor or the property manager should inspect the residential
                      premises and record the condition of the premises by indicating whether the particular room item
                      is clean, undamaged and working by placing "Y" (YES) or "N" (NO) in the appropriate column. Where
                      necessary, comments should be included in the report.
                    </li>
                    <li>
                      Two copies of the report, which has been filled out and signed by the lessor or the property
                      manager, must be given to the tenant within 7 days of the tenant moving into the premises.
                    </li>
                    <li>
                      As soon as possible after the tenant receives the property condition report, the tenant should inspect
                      the residential premises and complete the tenant section on both copies of the report. The tenant
                      indicates agreement or disagreement with the condition indicated by the lessor or the property manager
                      by placing "Y" (YES) or "N" (NO) in the appropriate column and by making any appropriate comments on
                      the form.
                    </li>
                    <li>
                      The tenant must return one copy of the completed property condition report to the lessor or the
                      property manager within 7 days after receiving it. The tenant should keep the second copy of the
                      property condition report.
                    </li>
                    <li>
                      If photographs or video recordings are taken at the time the property inspection is carried out, it
                      is recommended that all photographs or video recordings are signed and dated by all parties. NOTE:
                      Photographs and/or video recordings are not a substitute for accurate written descriptions of the
                      condition of the property.
                    </li>
                    <li>
                      As soon as practicable, and in any event within 14 days after the termination of the tenancy agreement,
                      the lessor or the property manager should complete a property condition report, indicating the
                      condition of the premises at the end of the tenancy. This should be done in the presence of the
                      tenant, unless the tenant has been given a reasonable opportunity to be present and has not attended
                      the inspection.
                    </li>
                  </ol>
                </div>

                <div>
                  <h4 className="font-extrabold text-neutral-900 uppercase tracking-wider text-[10px] mb-1">
                    IMPORTANT NOTES ABOUT THIS PROPERTY CONDITION REPORT
                  </h4>
                  <ol className="list-decimal pl-4 space-y-0.5 text-justify">
                    <li>
                      This property condition report is an important record of the condition of the residential premises when
                      the tenancy begins. It may be used as evidence of the state of repair or general condition of the
                      premises at the commencement of the tenancy if there is a dispute, particularly about the return of
                      the security bond money and any damage to the premises. It is important to complete the property
                      condition report accurately.
                    </li>
                    <li>A property condition report must be filled out whether or not a security bond is paid.</li>
                    <li>
                      At the end of the tenancy the premises must be inspected and the condition of the premises at that time
                      will be compared to that stated in the original property condition report.
                    </li>
                    <li>
                      A tenant is not responsible for fair wear and tear to the premises. Fair wear and tear is a general term
                      for anything that occurs through ordinary use such as the carpet becoming worn in frequently used
                      areas. Wilful and intentional damage, or damage caused by negligence, is not fair wear and tear.
                    </li>
                    <li>
                      If you do not have enough space on the report, attach a separate sheet. All attachments should be signed
                      and dated by all of the parties to the residential tenancy agreement.
                    </li>
                    <li>
                      Information about the rights and responsibilities of lessors and tenants may be obtained by contacting
                      the Department of Local Government, Industry Regulation and Safety on 1300 30 40 54 or visiting{' '}
                      <span className="font-semibold underline">www.consumerprotection.wa.gov.au</span>.
                    </li>
                  </ol>
                </div>

                <div className="bg-neutral-100 p-1.5 border border-neutral-300 rounded text-[8.5px] text-neutral-800 space-y-0.5">
                  <p>
                    <span className="font-bold">For further information about tenancy rights:</span> refer to the{' '}
                    <span className="font-semibold italic">Residential Tenancies Act 1987</span> or contact the
                    Department of Local Government, Industry Regulation and Safety on 1300 304 054 or{' '}
                    <span className="font-semibold">www.consumerprotection.wa.gov.au</span>.
                  </p>
                  <p>
                    <span className="font-bold">Translating and Interpreting Services:</span> please telephone TIS on 13 14 50
                    and ask to speak to the Department of Local Government, Industry Regulation and Safety (1300 304 054) for
                    assistance.
                  </p>
                </div>
              </div>

              {/* Additional tenancy details */}
              <div className="mt-2.5">
                <div className="bg-neutral-200 border border-neutral-400 px-2 py-1 font-extrabold text-[10.5px] uppercase tracking-wider text-neutral-900">
                  Tenancy Details
                </div>

                <div className="border border-neutral-400 border-t-0 divide-y divide-neutral-300 text-[10px]">
                  <div className="flex items-center p-1.5">
                    <div className="w-40 font-bold text-neutral-800">Property Address:</div>
                    <div className="flex-1 font-semibold text-neutral-900 border border-neutral-300 px-2 py-0.5 bg-neutral-50 rounded-xs">
                      {details.propertyAddress}
                    </div>
                  </div>

                  <div className="flex items-center p-1.5">
                    <div className="w-40 font-bold text-neutral-800">Inspecting Agent:</div>
                    <div className="flex-1 font-medium text-neutral-900 border border-neutral-300 px-2 py-0.5 bg-neutral-50 rounded-xs">
                      {details.inspectingAgent}
                    </div>
                  </div>

                  <div className="flex items-center p-1.5">
                    <div className="w-40 font-bold text-neutral-800">Inspection Date:</div>
                    <div className="flex-1 font-medium text-neutral-900 border border-neutral-300 px-2 py-0.5 bg-neutral-50 rounded-xs">
                      {details.inspectionDate}
                    </div>
                  </div>

                  <div className="flex items-center p-1.5">
                    <div className="w-40 font-bold text-neutral-800">Tenancy Start Date:</div>
                    <div className="flex-1 font-medium text-neutral-900 border border-neutral-300 px-2 py-0.5 bg-neutral-50 min-h-[22px] rounded-xs">
                      {details.tenancyStartDate}
                    </div>
                  </div>

                  <div className="flex items-center p-1.5">
                    <div className="w-40 font-bold text-neutral-800">Tenant/s:</div>
                    <div className="flex-1 font-medium text-neutral-900 border border-neutral-300 px-2 py-0.5 bg-neutral-50 min-h-[22px] rounded-xs">
                      {details.tenants}
                    </div>
                  </div>

                  <div className="flex items-center p-1.5">
                    <div className="w-40 font-bold text-neutral-800">Tenant Received Date:</div>
                    <div className="flex-1 font-medium text-neutral-900 border border-neutral-300 px-2 py-0.5 bg-neutral-50 min-h-[22px] rounded-xs">
                      {details.tenantReceivedDate}
                    </div>
                  </div>

                  <div className="flex items-center p-1.5">
                    <div className="w-40 font-bold text-neutral-800">Report Return Date:</div>
                    <div className="flex-1 font-medium text-neutral-900 border border-neutral-300 px-2 py-0.5 bg-neutral-50 min-h-[22px] rounded-xs">
                      {details.reportReturnDate}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Initials bar */}
            {renderInitialsFooter(pageCounter)}
          </div>
        );
      })()}

      {/* ================= INSPECTION AREA PAGES (PAGES 3 TO N) ================= */}
      {areaPages.map((areaPage, groupIndex) => {
        pageCounter++;
        const thisPageNum = pageCounter;

        return (
          <div
            key={`page-area-group-${groupIndex}`}
            className="pdf-page pdf-commentary-page w-[210mm] min-h-[297mm] h-[297mm] bg-white text-neutral-900 p-[12mm] flex flex-col justify-between shadow-2xl relative box-border overflow-hidden select-text text-[10px]"
          >
            <div>
              {/* Running report header */}
              <div className="flex justify-between items-center border-b-2 border-neutral-900 pb-1 mb-2 font-bold text-[11px]">
                <span className="text-neutral-900">{details.propertyAddress}</span>
                <span className="text-neutral-900">{details.reportType} Condition Report</span>
              </div>

              {/* Main Table Structure */}
              <table className="w-full table-fixed border-collapse border border-neutral-400 text-left">
                <colgroup>
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '4%' }} />
                  <col style={{ width: '4%' }} />
                  <col style={{ width: '4%' }} />
                  <col style={{ width: '40%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '18%' }} />
                </colgroup>
                {/* Condition report column headers */}
                <thead>
                  <tr className="bg-neutral-100 text-neutral-900 font-bold border-b border-neutral-400">
                    <th colSpan={5} className="border-r border-neutral-400 p-1 text-center text-[10.5px]">
                      Agent section
                      <div className="text-[8px] font-normal text-neutral-600 mt-0.5 leading-snug">
                        Each item has been given a column description of 'clean', 'undamaged', 'working'. Tick each column
                        that applies to the item and make any necessary comments.
                      </div>
                    </th>
                    <th colSpan={2} className="p-1 text-center text-[10.5px]">
                      Tenant section
                      <div className="text-[8px] font-normal text-neutral-600 mt-0.5 leading-snug">
                        If you disagree with the agent's report of an item, make a comment in this section. You should
                        also note anything which seems unsafe or may be an injury risk.
                      </div>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {(() => {
                    const area = areaPage.area;
                    return (
                    <React.Fragment key={`${area.id}-${groupIndex}`}>
                      {/* Area Header Row */}
                      <tr className="bg-neutral-200/90 font-bold text-neutral-900 border-t-2 border-b border-neutral-400">
                        <td className="p-1 text-[10.5px] font-extrabold uppercase break-words">
                          {area.name}{areaPage.continuation ? ' (continued)' : ''}
                        </td>
                        <td className="w-7 text-center p-1 text-[8.5px] font-bold border-l border-neutral-400">Cln</td>
                        <td className="w-7 text-center p-1 text-[8.5px] font-bold border-l border-neutral-400">Udg</td>
                        <td className="w-7 text-center p-1 text-[8.5px] font-bold border-l border-neutral-400">Wkg</td>
                        <td className="border-l border-r border-neutral-400 p-1 text-center font-bold text-[8.5px]">
                          Agent comments
                          <span className="block font-normal text-[7px] text-neutral-600 italic">
                            Cln = Clean, Udg = Undamaged, Wkg = Working
                          </span>
                        </td>
                        <td className="w-12 text-center p-1 text-[8px] font-bold border-r border-neutral-400">
                          Tenant agrees
                        </td>
                        <td className="w-48 text-center p-1 text-[8.5px] font-bold">Tenant comments</td>
                      </tr>

                      {/* Overall photos reference row */}
                      {(() => {
                        const areaPhotosCount =
                          photos.filter(
                            (p) => (p.areaName || '').trim().toLowerCase() === area.name.trim().toLowerCase()
                          ).length ||
                          area.overallPhotoCount ||
                          0;
                        if (areaPhotosCount <= 0) return null;
                        return (
                          <tr className="border-b border-neutral-300 text-blue-700 font-medium bg-neutral-50/50">
                            <td className="p-1 font-semibold text-neutral-800">Overall</td>
                            <td className="border-l border-neutral-300"></td>
                            <td className="border-l border-neutral-300"></td>
                            <td className="border-l border-neutral-300"></td>
                            <td className="border-l border-r border-neutral-300 p-1 text-[9px] font-semibold">
                              ({areaPhotosCount} {areaPhotosCount === 1 ? 'photo' : 'photos'}, see photo gallery)
                            </td>
                            <td className="border-r border-neutral-300"></td>
                            <td></td>
                          </tr>
                        );
                      })()}

                      {/* Items rows with Y / N checkboxes for WA compliance */}
                      {areaPage.items.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-neutral-300 hover:bg-neutral-50/80 transition-colors align-top text-[9px]"
                        >
                          {/* Item name */}
                          <td className="p-1 font-medium text-neutral-900 pr-1 break-words">{item.name}</td>

                          {/* Clean (Y / N) */}
                          <td className="border-l border-neutral-300 text-center p-1 font-bold">
                            {item.clean === true ? (
                              <span className="text-neutral-900">Y</span>
                            ) : item.clean === false ? (
                              <span className="text-red-700">N</span>
                            ) : (
                              ''
                            )}
                          </td>

                          {/* Undamaged (Y / N) */}
                          <td className="border-l border-neutral-300 text-center p-1 font-bold">
                            {item.undamaged === true ? (
                              <span className="text-neutral-900">Y</span>
                            ) : item.undamaged === false ? (
                              <span className="text-red-700">N</span>
                            ) : (
                              ''
                            )}
                          </td>

                          {/* Working (Y / N) */}
                          <td className="border-l border-neutral-300 text-center p-1 font-bold">
                            {item.working === true ? (
                              <span className="text-neutral-900">Y</span>
                            ) : item.working === false ? (
                              <span className="text-red-700">N</span>
                            ) : (
                              ''
                            )}
                          </td>

                          {/* Agent comments */}
                          <td className="border-l border-r border-neutral-300 p-1 font-normal text-neutral-800 whitespace-pre-line break-words leading-tight">
                            {item.agentComments || ''}
                          </td>

                          {/* Tenant agrees */}
                          <td className="border-r border-neutral-300 text-center p-1 font-bold text-neutral-900">
                            {item.tenantAgrees === true ? 'Y' : item.tenantAgrees === false ? 'N' : ''}
                          </td>

                          {/* Tenant comments */}
                          <td className="p-1 text-neutral-800 italic break-words leading-tight">
                            {item.tenantComments || ''}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                    );
                  })()}
                </tbody>
              </table>
            </div>

            {/* Initials bar */}
            {renderInitialsFooter(thisPageNum)}
          </div>
        );
      })}

      {/* ================= PHOTO PAGES (3x4 Grid = 12 photos per page) ================= */}
      {photoPages.map((photoGroup, pageIdx) => {
        pageCounter++;
        const thisPageNum = pageCounter;

        return (
          <div
            key={`page-photos-${pageIdx}`}
            className="pdf-page pdf-photo-page w-[210mm] min-h-[297mm] h-[297mm] bg-white text-neutral-900 p-[12mm] flex flex-col justify-between shadow-2xl relative box-border overflow-hidden select-text text-[10px]"
          >
            <div>
              {/* Running header matching sample */}
              <div className="flex justify-between items-center border-b-2 border-neutral-900 pb-1 mb-2 font-bold text-[11px]">
                <span className="text-neutral-900">{details.propertyAddress}</span>
                <span className="text-neutral-900">{details.reportType} Condition Report</span>
              </div>

              {/* Title on the first photo page */}
              {pageIdx === 0 && (
                <div className="bg-neutral-100 border border-neutral-400 px-2 py-1 mb-2 text-xs font-bold text-neutral-900">
                  Agent Inspection Photos ({totalPhotos} photos)
                </div>
              )}

              {/* 3 columns x 4 rows grid */}
              <div className="grid grid-cols-3 gap-2 mt-1 min-w-0">
                {photoGroup.map((photo, pIdx) => {
                  const absoluteIndex = pageIdx * photosPerPage + pIdx + 1;
                  return (
                    <div key={photo.id} className="min-w-0 flex flex-col border border-neutral-200 p-0.5 rounded bg-neutral-50/50">
                      {/* Photo Caption Header */}
                      <div className="font-bold text-[8px] text-neutral-900 leading-tight truncate px-1 py-0.5">
                        {photo.name || `${photo.areaName || 'Overall'}: photo ${photo.photoIndex || absoluteIndex}`}
                      </div>

                      {/* Photo Image Aspect */}
                      <div className="w-full h-[47mm] bg-neutral-200 overflow-hidden rounded-xs flex items-center justify-center">
                        {photo.dataUrl || photo.url ? (
                          <img
                            src={photo.dataUrl || photo.url}
                            alt={photo.name}
                            className="block w-full h-full max-w-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[8px] text-neutral-500">
                            Photo unavailable
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Initials bar */}
            {renderInitialsFooter(thisPageNum)}
          </div>
        );
      })}

      {/* ================= FINAL PAGE: WA FORM 1 STATUTORY SIGNATURES, WORK DATES & DISCLAIMER ================= */}
      {(() => {
        pageCounter++;
        const thisPageNum = pageCounter;

        return (
          <div className="pdf-page w-[210mm] min-h-[297mm] h-[297mm] bg-white text-neutral-900 p-[12mm] flex flex-col justify-between shadow-2xl relative box-border overflow-hidden select-text text-[10px] leading-tight">
            <div>
              {/* Running header */}
              <div className="flex justify-between items-center border-b-2 border-neutral-900 pb-1 mb-3 font-bold text-[11px]">
                <span className="text-neutral-900">{details.propertyAddress}</span>
                <span className="text-neutral-900">{details.reportType} Condition Report</span>
              </div>

              {/* Entry Report Additional comments box */}
              <div className="mb-3">
                <h4 className="font-bold text-neutral-900 mb-1 text-[10.5px]">Entry Report Additional comments</h4>
                <div className="w-full min-h-[24mm] border border-neutral-400 p-2 text-[9.5px] text-neutral-800 bg-neutral-50/30 whitespace-pre-line">
                  {details.additionalComments || 'No additional general comments provided.'}
                </div>
              </div>

              {/* Approximate dates when work last done on residential premises (WA statutory table) */}
              <div className="mb-3">
                <h4 className="font-bold text-neutral-900 mb-1 text-[10.5px]">
                  Approximate dates when work last done on residential premises
                </h4>

                <div className="border border-neutral-400 divide-y divide-neutral-300 text-[10px]">
                  <div className="flex items-center justify-between p-1.5">
                    <span className="font-medium text-neutral-800">Painting of premises (external):</span>
                    <div className="w-48 border border-neutral-400 px-3 py-1 text-center font-mono font-medium text-neutral-900 bg-neutral-50">
                      {details.paintingPremisesExternalDate || '/ /'}
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-1.5">
                    <span className="font-medium text-neutral-800">Painting of premises (internal):</span>
                    <div className="w-48 border border-neutral-400 px-3 py-1 text-center font-mono font-medium text-neutral-900 bg-neutral-50">
                      {details.paintingPremisesInternalDate || '/ /'}
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-1.5">
                    <span className="font-medium text-neutral-800">Floorcoverings laid:</span>
                    <div className="w-48 border border-neutral-400 px-3 py-1 text-center font-mono font-medium text-neutral-900 bg-neutral-50">
                      {details.floorcoveringsLaidDate || '/ /'}
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-1.5">
                    <span className="font-medium text-neutral-800">Floorcoverings professionally cleaned:</span>
                    <div className="w-48 border border-neutral-400 px-3 py-1 text-center font-mono font-medium text-neutral-900 bg-neutral-50">
                      {details.floorcoveringsCleanedDate || '/ /'}
                    </div>
                  </div>
                </div>
                <p className="mt-1 text-[8.5px] text-neutral-600 leading-tight">
                  Note: Further items and comments may be recorded on a separate sheet, signed by the
                  lessor/property manager and the tenant, and attached to this report.
                </p>
              </div>

              {/* Lessor/property manager's signature */}
              <div className="mb-3">
                <div className="bg-neutral-100 border border-neutral-400 px-2 py-1 font-bold text-neutral-900 text-[10px]">
                  Lessor/property manager's signature
                </div>
                <div className="grid grid-cols-3 border border-neutral-400 border-t-0 text-[10px]">
                  <div className="p-2 border-r border-neutral-300">
                    <span className="font-semibold text-neutral-700">Print Name: </span>
                    <span className="font-bold text-neutral-900">{details.agentSignName || details.inspectingAgent}</span>
                  </div>
                  <div className="p-2 border-r border-neutral-300">
                    <span className="font-semibold text-neutral-700">Signature: </span>
                    <span className="font-serif italic font-bold text-neutral-800 text-sm ml-1">
                      {details.agentSignName || details.inspectingAgent}
                    </span>
                  </div>
                  <div className="p-2">
                    <span className="font-semibold text-neutral-700">Date: </span>
                    <span className="font-medium">{details.agentSignDate || details.inspectionDate}</span>
                  </div>
                </div>
              </div>

              {/* Tenant's Acknowledgement & Signature (up to 3 tenants as per WA Form 1) */}
              <div className="mb-3">
                <div className="bg-neutral-100 border border-neutral-400 px-2 py-1 font-bold text-neutral-900 text-[10px]">
                  Tenant's Acknowledgement & Signature
                </div>
                <p className="text-[8.5px] text-neutral-600 px-2 py-0.5 border-x border-neutral-400 leading-tight">
                  I/we have received and read the Condition Report for the above property and understand that it must be
                  returned within 7 days.
                </p>

                {/* Tenant 1 */}
                <div className="grid grid-cols-12 border border-neutral-400 text-[9.5px]">
                  <div className="col-span-4 p-1.5 border-r border-neutral-300">
                    <span className="font-bold text-neutral-800">Tenant 1</span>
                    <div className="text-neutral-500 text-[8.5px]">Print Name:</div>
                    <div className="font-bold text-neutral-900 mt-0.5 min-h-[16px]">
                      {details.tenant1SignName || (details.tenants ? details.tenants.split(',')[0] : '')}
                    </div>
                  </div>
                  <div className="col-span-5 p-1.5 border-r border-neutral-300">
                    <div className="text-neutral-500 text-[8.5px]">Signature:</div>
                    <div className="min-h-[16px] mt-0.5"></div>
                  </div>
                  <div className="col-span-3 p-1.5">
                    <div className="text-neutral-500 text-[8.5px]">Date:</div>
                    <div className="mt-0.5 font-mono">/ /</div>
                  </div>
                </div>

                {/* Tenant 2 */}
                <div className="grid grid-cols-12 border border-neutral-400 border-t-0 text-[9.5px]">
                  <div className="col-span-4 p-1.5 border-r border-neutral-300">
                    <span className="font-bold text-neutral-800">Tenant 2</span>
                    <div className="text-neutral-500 text-[8.5px]">Print Name:</div>
                    <div className="font-bold text-neutral-900 mt-0.5 min-h-[16px]">
                      {details.tenant2SignName || (details.tenants && details.tenants.split(',')[1] ? details.tenants.split(',')[1].trim() : '')}
                    </div>
                  </div>
                  <div className="col-span-5 p-1.5 border-r border-neutral-300">
                    <div className="text-neutral-500 text-[8.5px]">Signature:</div>
                    <div className="min-h-[16px] mt-0.5"></div>
                  </div>
                  <div className="col-span-3 p-1.5">
                    <div className="text-neutral-500 text-[8.5px]">Date:</div>
                    <div className="mt-0.5 font-mono">/ /</div>
                  </div>
                </div>

                {/* Tenant 3 */}
                <div className="grid grid-cols-12 border border-neutral-400 border-t-0 text-[9.5px]">
                  <div className="col-span-4 p-1.5 border-r border-neutral-300">
                    <span className="font-bold text-neutral-800">Tenant 3</span>
                    <div className="text-neutral-500 text-[8.5px]">Print Name:</div>
                    <div className="font-bold text-neutral-900 mt-0.5 min-h-[16px]">
                      {details.tenant3SignName || (details.tenants && details.tenants.split(',')[2] ? details.tenants.split(',')[2].trim() : '')}
                    </div>
                  </div>
                  <div className="col-span-5 p-1.5 border-r border-neutral-300">
                    <div className="text-neutral-500 text-[8.5px]">Signature:</div>
                    <div className="min-h-[16px] mt-0.5"></div>
                  </div>
                  <div className="col-span-3 p-1.5">
                    <div className="text-neutral-500 text-[8.5px]">Date:</div>
                    <div className="mt-0.5 font-mono">/ /</div>
                  </div>
                </div>
              </div>

              {/* Disclaimer */}
              <div className="mt-2">
                <h5 className="font-bold text-[8.5px] uppercase tracking-wider text-neutral-800 mb-0.5">
                  DISCLAIMER:
                </h5>
                <p className="text-[7.5px] text-neutral-600 leading-tight italic text-justify">
                  {details.disclaimerText}
                </p>
              </div>
            </div>

            {/* Initials bar */}
            {renderInitialsFooter(thisPageNum)}
          </div>
        );
      })()}

      <MaintenanceRegisterPreview report={report} />
    </div>
  );
};

import React from 'react';
import { BookmarkPlus, CheckCircle2, Download, RefreshCw } from 'lucide-react';
import { isKeyReceiptTemplate } from '../data/reportCatalogue';
import { DeliveryPanel } from './DeliveryPanel';
import { validateReportForFinalization } from '../lib/reportValidation';
import { ReportData } from '../types/report';

interface Props {
  report: ReportData;
  onDownload: () => void;
  onComplete: () => void;
  onDownloadCompleted: () => void;
  onSyncPlatform?: () => void;
  isSyncingPlatform?: boolean;
  isExporting: boolean;
  isCompleting: boolean;
  onSaveTemplate?: () => Promise<void>;
}

export const ReportActions: React.FC<Props> = ({
  report,
  onDownload,
  onComplete,
  onDownloadCompleted,
  onSyncPlatform,
  isSyncingPlatform = false,
  isExporting,
  isCompleting,
  onSaveTemplate,
}) => {
  const details = report.details;
  const completed = report.status === 'completed';
  const validationIssues = completed ? [] : validateReportForFinalization(report);
  const validationMessages = Array.from(new Set(validationIssues.map((issue) => issue.message)));
  const keyItemCount = report.areas.reduce((total, area) => total + area.items.length, 0);

  return (
    <div className="max-w-3xl mx-auto bg-white border border-neutral-200 rounded-xl p-5 shadow-xs space-y-4">
      <div>
        <h3 className="font-bold text-neutral-900">Review & send</h3>
        <p className="text-xs text-neutral-500 mt-1">
          {isKeyReceiptTemplate(report.details.reportType)
            ? `${keyItemCount} key/access item${keyItemCount === 1 ? '' : 's'} • ${completed ? 'Completed' : 'Draft'}`
            : `${report.areas.length} areas • ${report.photos.length} photos • ${completed ? 'Completed' : 'Draft'}`}
        </p>
      </div>

      {!completed && validationMessages.length > 0 && (
        <div className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3">
          <div className="font-bold">Resolve before finalising:</div>
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            {validationMessages.slice(0, 5).map((message) => <li key={message}>{message}</li>)}
          </ul>
          {validationMessages.length > 5 && (
            <div className="mt-1">+{validationMessages.length - 5} additional validation issue(s).</div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {onSaveTemplate && (
          <button
            onClick={() => void onSaveTemplate()}
            className="px-4 py-2 border border-neutral-300 bg-white rounded-lg text-sm font-bold flex items-center gap-2"
          >
            <BookmarkPlus className="w-4 h-4" /> Save Layout as Template
          </button>
        )}
        {completed ? (
          <>
            <button
              onClick={onDownloadCompleted}
              className="px-4 py-2 bg-[#0a2540] text-white rounded-lg text-sm font-bold flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> Download Saved PDF
            </button>
            {report.integrationContext && onSyncPlatform && (
              <button
                onClick={onSyncPlatform}
                disabled={isSyncingPlatform}
                className="px-4 py-2 border border-neutral-300 bg-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncingPlatform ? 'animate-spin' : ''}`} />
                {isSyncingPlatform ? 'Syncing…' : 'Sync to ProInspect'}
              </button>
            )}
          </>
        ) : (
          <>
            <button
              onClick={onDownload}
              disabled={isExporting || isCompleting}
              className="px-4 py-2 border border-neutral-300 bg-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> {isExporting ? 'Preparing...' : 'Download Draft PDF'}
            </button>
            <button
              onClick={onComplete}
              disabled={isExporting || isCompleting || validationIssues.length > 0}
              className="px-4 py-2 bg-[#0a2540] text-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isCompleting ? 'Finalising...' : 'Finalise & Store PDF'}
            </button>
          </>
        )}
      </div>

      {completed && <DeliveryPanel report={report} />}
    </div>
  );
};

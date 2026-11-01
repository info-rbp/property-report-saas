import React, { useEffect, useState } from 'react';
import { ArrowLeft, Bookmark, Download, FileText, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { isKeyReceiptTemplate, REPORT_CATEGORIES, REPORT_TEMPLATES, reportLabel } from '../data/reportCatalogue';
import { PropertyRecord, ReportSummary, ReportType } from '../types/report';
import type { ReportTemplateRecord } from '../types/workflow';

interface Props {
  property: PropertyRecord;
  reports: ReportSummary[];
  onBack: () => void;
  onCreate: (type: ReportType) => Promise<void>;
  onCreateFromTemplate: (template: ReportTemplateRecord) => Promise<void>;
  onOpen: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onDownloadCompleted: (id: string) => void;
}

export const ReportDashboard: React.FC<Props> = ({
  property,
  reports,
  onBack,
  onCreate,
  onCreateFromTemplate,
  onOpen,
  onDelete,
  onDownloadCompleted,
}) => {
  const [type, setType] = useState<ReportType>('Entry');
  const [isCreating, setIsCreating] = useState(false);
  const [templates, setTemplates] = useState<ReportTemplateRecord[]>([]);
  const [templateId, setTemplateId] = useState('');

  useEffect(() => {
    api.listTemplates(property.id)
      .then((items) => {
        setTemplates(items);
        if (items.length) setTemplateId((current) => current || items[0].id);
      })
      .catch(() => setTemplates([]));
  }, [property.id]);

  const create = async () => {
    setIsCreating(true);
    try {
      await onCreate(type);
    } finally {
      setIsCreating(false);
    }
  };

  const createFromTemplate = async () => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setIsCreating(true);
    try {
      await onCreateFromTemplate(template);
    } finally {
      setIsCreating(false);
    }
  };

  const removeTemplate = async (id: string) => {
    if (!confirm('Delete this saved report template?')) return;
    await api.deleteTemplate(id);
    const next = templates.filter((item) => item.id !== id);
    setTemplates(next);
    setTemplateId(next[0]?.id || '');
  };

  return (
    <main className="flex-1 bg-neutral-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <button onClick={onBack} className="text-xs font-bold text-neutral-600 flex items-center gap-1.5">
          <ArrowLeft className="w-3.5 h-3.5" /> Properties
        </button>

        <section className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs">
          <h1 className="text-xl font-bold text-neutral-900">{property.address}</h1>
          <p className="text-xs text-neutral-500 mt-1">
            {property.reference || 'No property reference'}
          </p>
          {property.notes && <p className="text-sm text-neutral-600 mt-3">{property.notes}</p>}

          <div className="mt-5 pt-5 border-t border-neutral-200 flex flex-wrap gap-2 items-center">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ReportType)}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              {REPORT_CATEGORIES.map((category) => (
                <optgroup key={category} label={category}>
                  {REPORT_TEMPLATES.filter((template) => template.category === category && template.selectable !== false).map((template) => (
                    <option key={template.type} value={template.type}>{template.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              onClick={create}
              disabled={isCreating}
              className="px-4 py-2 rounded-lg bg-[#0a2540] text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> {isCreating ? 'Creating...' : 'Create Report'}
            </button>
          </div>
        </section>

        <section className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-start gap-3">
            <Bookmark className="w-5 h-5 text-[#0a2540] mt-0.5" />
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-neutral-900">Saved report templates</h2>
              <p className="text-xs text-neutral-500 mt-1">
                Create a fresh report from a saved layout. Photos, historical commentary, dates and signatures are not copied.
              </p>
              {templates.length === 0 ? (
                <div className="mt-3 text-xs text-neutral-500">No saved templates are available for this property yet.</div>
              ) : (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <select
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    className="min-w-64 border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} {template.scopeType === 'property' ? '• Property' : '• Global'}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={createFromTemplate}
                    disabled={isCreating || !templateId}
                    className="px-4 py-2 rounded-lg bg-[#0a2540] text-white text-sm font-bold disabled:opacity-50"
                  >
                    Create from Template
                  </button>
                  <button
                    onClick={() => templateId && void removeTemplate(templateId)}
                    disabled={!templateId}
                    className="p-2 text-red-600 border border-neutral-300 rounded-lg disabled:opacity-40"
                    title="Delete selected template"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-neutral-200">
            <h2 className="font-bold text-neutral-900">Reports</h2>
          </div>
          {reports.length === 0 ? (
            <div className="p-10 text-center text-sm text-neutral-500">No reports for this property yet.</div>
          ) : (
            <div className="divide-y divide-neutral-200">
              {reports.map((report) => (
                <div key={report.id} className="p-4 flex items-center justify-between gap-4">
                  <button
                    onClick={() => onOpen(report.id)}
                    className="text-left flex-1 min-w-0"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-neutral-500 shrink-0" />
                      <span className="font-bold text-neutral-900">{report.title || reportLabel(report.reportType)}</span>
                      <span className={`text-[10px] uppercase font-bold rounded-full px-2 py-0.5 ${
                        report.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {report.status}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-500 mt-1 ml-6">
                      {isKeyReceiptTemplate(report.reportType) ? 'Receipt' : report.reportType === 'Custom' ? 'Report' : 'Inspection'} {report.inspectionDate || 'date not set'} • Updated {new Date(report.updatedAt).toLocaleString()}
                    </div>
                  </button>

                  <div className="flex gap-2">
                    {report.status === 'completed' ? (
                      <>
                        <button
                          onClick={() => onOpen(report.id)}
                          className="px-3 py-1.5 text-xs font-bold border border-neutral-300 rounded-lg bg-white"
                        >
                          View / Send
                        </button>
                        <button
                          onClick={() => onDownloadCompleted(report.id)}
                          className="px-3 py-1.5 text-xs font-bold border border-neutral-300 rounded-lg bg-white flex items-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" /> PDF
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => onOpen(report.id)}
                          className="px-3 py-1.5 text-xs font-bold border border-neutral-300 rounded-lg bg-white"
                        >
                          Continue
                        </button>
                        <button
                          onClick={() => onDelete(report.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                          title="Delete draft"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

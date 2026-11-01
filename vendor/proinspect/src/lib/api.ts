import { PropertyRecord, ProInspectIntegrationContext, ReportData, ReportSummary, ReportType } from '../types/report';
import type {
  PublicSigningPacket,
  ReportDeliveryRecord,
  ReportTemplateRecord,
  SendForSignatureInput,
  SendReportInput,
} from '../types/workflow';

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers || {}),
    },
    credentials: 'same-origin',
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = await response.json() as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export const api = {
  me: () => apiRequest<{ email: string }>('/api/me'),

  resolveProInspectHandoff: (token: string) =>
    apiRequest<ProInspectIntegrationContext>(
      `/api/integrations/proinspect/handoff?token=${encodeURIComponent(token)}`
    ),

  listProperties: () => apiRequest<PropertyRecord[]>('/api/properties'),

  createProperty: (input: { address: string; reference?: string; notes?: string }) =>
    apiRequest<PropertyRecord>('/api/properties', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateProperty: (id: string, input: { address: string; reference?: string; notes?: string }) =>
    apiRequest<PropertyRecord>(`/api/properties/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  getProperty: (id: string) =>
    apiRequest<{ property: PropertyRecord; reports: ReportSummary[] }>(
      `/api/properties/${encodeURIComponent(id)}`
    ),

  createReport: (propertyId: string, reportType: ReportType, report: ReportData) =>
    apiRequest<ReportData>(`/api/properties/${encodeURIComponent(propertyId)}/reports`, {
      method: 'POST',
      body: JSON.stringify({ reportType, report }),
    }),

  getReport: (id: string) =>
    apiRequest<ReportData>(`/api/reports/${encodeURIComponent(id)}`),

  saveReport: (report: ReportData, expectedUpdatedAt?: string) =>
    apiRequest<ReportData>(`/api/reports/${encodeURIComponent(report.id || '')}`, {
      method: 'PUT',
      body: JSON.stringify({ report, expectedUpdatedAt }),
    }),

  deleteReport: (id: string) =>
    apiRequest<{ success: true }>(`/api/reports/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  uploadCoverPhoto: async (reportId: string, file: Blob) => {
    const form = new FormData();
    form.append('file', file, 'cover.jpg');

    return apiRequest<ReportData>(`/api/reports/${encodeURIComponent(reportId)}/cover`, {
      method: 'POST',
      body: form,
    });
  },

  uploadPhoto: async (
    reportId: string,
    file: Blob,
    metadata: { id: string; name: string; areaName: string; itemId?: string; itemName?: string; photoIndex: number; isCover?: boolean }
  ) => {
    const form = new FormData();
    form.append('file', file, `${metadata.id}.jpg`);
    form.append('photoId', metadata.id);
    form.append('name', metadata.name);
    form.append('areaName', metadata.areaName);
    if (metadata.itemId) form.append('itemId', metadata.itemId);
    if (metadata.itemName) form.append('itemName', metadata.itemName);
    form.append('photoIndex', String(metadata.photoIndex));
    form.append('isCover', metadata.isCover ? 'true' : 'false');

    return apiRequest<ReportData>(`/api/reports/${encodeURIComponent(reportId)}/photos`, {
      method: 'POST',
      body: form,
    });
  },

  deletePhoto: (reportId: string, photoId: string) =>
    apiRequest<ReportData>(
      `/api/reports/${encodeURIComponent(reportId)}/photos/${encodeURIComponent(photoId)}`,
      { method: 'DELETE' }
    ),

  completeReport: async (reportId: string, pdf: Blob) => {
    const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: pdf,
      credentials: 'same-origin',
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string; code?: string };
      const error = new Error(data.error || `Unable to complete report (${response.status})`) as Error & { code?: string };
      error.code = data.code;
      throw error;
    }
    return response.json() as Promise<ReportData>;
  },

  publishCompletedReport: (reportId: string) =>
    apiRequest<{ success: true }>(`/api/reports/${encodeURIComponent(reportId)}/publish`, {
      method: 'POST',
    }),

  completedPdfUrl: (reportId: string) =>
    `/api/reports/${encodeURIComponent(reportId)}/pdf`,

  listTemplates: (propertyId?: string) =>
    apiRequest<ReportTemplateRecord[]>(
      `/api/templates${propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : ''}`
    ),

  createTemplate: (input: {
    name: string;
    scopeType: 'global' | 'property';
    propertyId?: string;
    templateData: ReportData;
  }) =>
    apiRequest<ReportTemplateRecord>('/api/templates', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  deleteTemplate: (id: string) =>
    apiRequest<{ success: true }>(`/api/templates/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  listDeliveries: (reportId: string) =>
    apiRequest<ReportDeliveryRecord[]>(`/api/reports/${encodeURIComponent(reportId)}/deliveries`),

  sendReport: (reportId: string, input: SendReportInput) =>
    apiRequest<ReportDeliveryRecord>(`/api/reports/${encodeURIComponent(reportId)}/send`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  sendForSignature: (reportId: string, input: SendForSignatureInput) =>
    apiRequest<ReportDeliveryRecord>(`/api/reports/${encodeURIComponent(reportId)}/signature-request`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  publicSigningPacket: (token: string) =>
    apiRequest<PublicSigningPacket>(`/api/public/signing/${encodeURIComponent(token)}`),

  publicSigningPdfUrl: (token: string) =>
    `/api/public/signing/${encodeURIComponent(token)}/pdf`,

  submitPublicSignature: (
    token: string,
    input: {
      signedName: string;
      signatureText: string;
      commentary?: string;
      fieldValues?: Record<string, string>;
    }
  ) =>
    apiRequest<{
      completed: boolean;
      readyForExecution?: boolean;
      packet?: PublicSigningPacket;
      report?: ReportData;
    }>(`/api/public/signing/${encodeURIComponent(token)}/sign`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  publicExecutionPayload: (token: string) =>
    apiRequest<{
      completed: boolean;
      alreadyStored?: boolean;
      readyForExecution?: boolean;
      report?: ReportData;
    }>(`/api/public/signing/${encodeURIComponent(token)}/execution-payload`),

  uploadExecutedPdf: async (token: string, pdf: Blob) => {
    const response = await fetch(`/api/public/signing/${encodeURIComponent(token)}/executed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: pdf,
      credentials: 'same-origin',
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error || `Unable to store executed report (${response.status})`);
    }
    return response.json() as Promise<{ success: true }>;
  },

  executedPdfUrl: (token: string) =>
    `/api/public/signing/${encodeURIComponent(token)}/executed-pdf`,
};

import { ReportData, ReportType } from './report';

export type TemplateScope = 'global' | 'property';

export interface ReportTemplateRecord {
  id: string;
  name: string;
  reportType: ReportType;
  scopeType: TemplateScope;
  propertyId?: string;
  templateData: ReportData;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export type DeliveryMode = 'send' | 'signature';
export type DeliveryStatus =
  | 'draft'
  | 'queued'
  | 'sent'
  | 'partially_signed'
  | 'completed'
  | 'failed'
  | 'void';

export type SigningOrder = 'sequential' | 'parallel';
export type SignatureRequestStatus =
  | 'draft'
  | 'sent'
  | 'partially_signed'
  | 'awaiting_countersignature'
  | 'completed'
  | 'void'
  | 'expired';

export interface DeliveryRecipient {
  name: string;
  email: string;
  roleLabel?: string;
  isCountersigner?: boolean;
}

export interface SignatureFieldInput {
  id?: string;
  partyIndex?: number;
  fieldType: 'signature' | 'text';
  label: string;
  placementLabel?: string;
  promptText?: string;
  pageNumber?: number;
  xPercent?: number;
  yPercent?: number;
  widthPercent?: number;
  required?: boolean;
  displayOrder?: number;
}

export interface SignaturePartyRecord {
  id: string;
  requestId: string;
  name: string;
  email: string;
  roleLabel: string;
  sequenceNumber: number;
  isCountersigner: boolean;
  status: 'pending' | 'sent' | 'viewed' | 'signed';
  signedName?: string;
  signatureText?: string;
  commentary?: string;
  signedAt?: string;
  viewedAt?: string;
}

export interface SignatureFieldRecord {
  id: string;
  requestId: string;
  partyId?: string;
  fieldType: 'signature' | 'text';
  label: string;
  placementLabel?: string;
  promptText?: string;
  pageNumber?: number;
  xPercent?: number;
  yPercent?: number;
  widthPercent?: number;
  required: boolean;
  displayOrder: number;
  valueText?: string;
  completedAt?: string;
}

export interface SignatureRequestRecord {
  id: string;
  deliveryId: string;
  reportId: string;
  signingOrder: SigningOrder;
  status: SignatureRequestStatus;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  parties: SignaturePartyRecord[];
  fields: SignatureFieldRecord[];
}

export interface ReportDeliveryRecord {
  id: string;
  reportId: string;
  deliveryMode: DeliveryMode;
  subject: string;
  message: string;
  to?: DeliveryRecipient[];
  cc?: string[];
  status: DeliveryStatus;
  resendEmailId?: string;
  createdAt: string;
  sentAt?: string;
  completedAt?: string;
  signatureRequest?: SignatureRequestRecord;
}

export interface SendReportInput {
  to: DeliveryRecipient[];
  cc?: string[];
  subject: string;
  message: string;
}

export interface SendForSignatureInput {
  parties: DeliveryRecipient[];
  signingOrder: SigningOrder;
  subject: string;
  message: string;
  expiresInDays?: number;
  fields: SignatureFieldInput[];
}

export interface PublicSigningPacket {
  requestId: string;
  reportId: string;
  reportTitle: string;
  propertyAddress: string;
  party: {
    id: string;
    name: string;
    email: string;
    roleLabel: string;
    isCountersigner: boolean;
    status: SignaturePartyRecord['status'];
  };
  fields: SignatureFieldRecord[];
  completedParties: Array<Pick<SignaturePartyRecord, 'name' | 'roleLabel' | 'signedAt'>>;
  canSign: boolean;
  signingOrder: SigningOrder;
  status: SignatureRequestStatus;
  expiresAt?: string;
}

export interface OfflineMutation {
  id: string;
  reportId: string;
  kind: 'save-report' | 'upload-photo' | 'delete-photo';
  createdAt: string;
  payload: unknown;
  attempts: number;
}

export interface GoogleDriveImportItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
}

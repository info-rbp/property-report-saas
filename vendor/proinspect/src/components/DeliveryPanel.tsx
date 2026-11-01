import React, { useEffect, useMemo, useState } from 'react';
import { FileSignature, Mail, Plus, Send, Trash2, UserRoundCheck } from 'lucide-react';
import { reportInstanceLabel } from '../data/reportCatalogue';
import { api } from '../lib/api';
import type { ReportData } from '../types/report';
import type {
  DeliveryRecipient,
  ReportDeliveryRecord,
  SignatureFieldInput,
  SigningOrder,
} from '../types/workflow';

interface PartyDraft extends DeliveryRecipient {
  id: string;
}

interface FieldDraft extends SignatureFieldInput {
  id: string;
}

function newParty(isCountersigner = false): PartyDraft {
  return {
    id: crypto.randomUUID(),
    name: '',
    email: '',
    roleLabel: isCountersigner ? 'Property Manager / Countersigner' : 'Client / Signatory',
    isCountersigner,
  };
}

function newSignatureField(partyIndex = 0): FieldDraft {
  return {
    id: crypto.randomUUID(),
    partyIndex,
    fieldType: 'signature',
    label: 'Signature',
    placementLabel: '',
    required: true,
  };
}

export const DeliveryPanel: React.FC<{ report: ReportData }> = ({ report }) => {
  const [mode, setMode] = useState<'send' | 'signature'>('send');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [parties, setParties] = useState<PartyDraft[]>([newParty(false)]);
  const [fields, setFields] = useState<FieldDraft[]>([newSignatureField(0)]);
  const [signingOrder, setSigningOrder] = useState<SigningOrder>('sequential');
  const [expiresInDays, setExpiresInDays] = useState(14);
  const [deliveries, setDeliveries] = useState<ReportDeliveryRecord[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const label = useMemo(() => reportInstanceLabel(report.details), [report.details]);

  useEffect(() => {
    const defaultSubject = `${label} - ${report.details.propertyAddress || 'Property'}`;
    setSubject(defaultSubject);
    setMessage(
      `Please find the completed ${label.toLowerCase()} for ${report.details.propertyAddress || 'the property'}.\n\nRegards,\nProInspect`
    );
  }, [label, report.details.propertyAddress]);

  const refreshHistory = async () => {
    if (!report.id) return;
    try {
      setDeliveries(await api.listDeliveries(report.id));
    } catch {
      // Delivery history remains optional while the workflow migration is not deployed.
    }
  };

  useEffect(() => {
    void refreshHistory();
  }, [report.id]);

  const sendOnly = async () => {
    if (!report.id || !recipientEmail.trim()) return;
    setIsSending(true);
    setNotice(null);
    try {
      await api.sendReport(report.id, {
        to: [{ name: recipientName.trim() || recipientEmail.trim(), email: recipientEmail.trim() }],
        cc: cc.split(',').map((value) => value.trim()).filter(Boolean),
        subject: subject.trim(),
        message: message.trim(),
      });
      setNotice({ type: 'success', text: 'Report sent through Resend and recorded in delivery history.' });
      await refreshHistory();
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Unable to send report.' });
    } finally {
      setIsSending(false);
    }
  };

  const sendForSignature = async () => {
    if (!report.id) return;
    setIsSending(true);
    setNotice(null);
    try {
      if (!parties.length) throw new Error('Add at least one signing party.');
      if (parties.some((party) => !party.email.trim())) {
        throw new Error('Every signing party must have an email address.');
      }
      const preparedParties = parties.map((party) => ({
        name: party.name.trim() || party.email.trim(),
        email: party.email.trim(),
        roleLabel: party.roleLabel?.trim(),
        isCountersigner: party.isCountersigner,
      }));

      await api.sendForSignature(report.id, {
        parties: preparedParties,
        signingOrder,
        subject: subject.trim(),
        message: message.trim(),
        expiresInDays,
        fields: fields.map((field) => ({
          partyIndex: Math.min(field.partyIndex || 0, preparedParties.length - 1),
          fieldType: field.fieldType,
          label: field.label.trim(),
          placementLabel: field.placementLabel?.trim(),
          promptText: field.promptText?.trim(),
          pageNumber: field.pageNumber,
          xPercent: field.xPercent,
          yPercent: field.yPercent,
          widthPercent: field.widthPercent,
          required: field.required !== false,
        })),
      });
      setNotice({
        type: 'success',
        text: 'Signature request sent. Countersigners will be invited after the preceding signatories have completed their signatures.',
      });
      await refreshHistory();
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Unable to create signature request.' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="border-t border-neutral-200 pt-5 space-y-5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode('send')}
          className={`px-3 py-2 rounded-lg text-xs font-bold border flex items-center gap-1.5 ${
            mode === 'send' ? 'bg-[#0a2540] text-white border-[#0a2540]' : 'bg-white border-neutral-300'
          }`}
        >
          <Mail className="w-3.5 h-3.5" /> Send Report
        </button>
        <button
          type="button"
          onClick={() => setMode('signature')}
          className={`px-3 py-2 rounded-lg text-xs font-bold border flex items-center gap-1.5 ${
            mode === 'signature' ? 'bg-[#0a2540] text-white border-[#0a2540]' : 'bg-white border-neutral-300'
          }`}
        >
          <FileSignature className="w-3.5 h-3.5" /> Send & Collect Signatures
        </button>
      </div>

      {mode === 'send' ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">Client / recipient name</label>
              <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">Recipient email *</label>
              <input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">CC</label>
            <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="comma-separated addresses" className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">Signing order</label>
              <select value={signingOrder} onChange={(e) => setSigningOrder(e.target.value as SigningOrder)} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="sequential">Sequential</option>
                <option value="parallel">Parallel (within each signing stage)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">Signing link expiry</label>
              <select value={expiresInDays} onChange={(e) => setExpiresInDays(Number(e.target.value))} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white">
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-neutral-800">Signing parties</h4>
                <p className="text-[11px] text-neutral-500">Countersigners are held until all earlier external signatories have signed.</p>
              </div>
              <button type="button" onClick={() => setParties((current) => [...current, newParty(false)])} className="text-xs font-bold flex items-center gap-1 px-2.5 py-1.5 border border-neutral-300 rounded-lg">
                <Plus className="w-3.5 h-3.5" /> Party
              </button>
            </div>
            {parties.map((party, index) => (
              <div key={party.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-2 border border-neutral-200 rounded-lg p-3 bg-neutral-50">
                <input value={party.name} onChange={(e) => setParties((current) => current.map((item) => item.id === party.id ? { ...item, name: e.target.value } : item))} placeholder="Name" className="border border-neutral-300 rounded-lg px-2 py-1.5 text-xs" />
                <input type="email" value={party.email} onChange={(e) => setParties((current) => current.map((item) => item.id === party.id ? { ...item, email: e.target.value } : item))} placeholder="Email" className="border border-neutral-300 rounded-lg px-2 py-1.5 text-xs" />
                <div className="flex gap-2">
                  <input value={party.roleLabel || ''} onChange={(e) => setParties((current) => current.map((item) => item.id === party.id ? { ...item, roleLabel: e.target.value } : item))} placeholder="Role / signature label" className="min-w-0 flex-1 border border-neutral-300 rounded-lg px-2 py-1.5 text-xs" />
                  <label className="flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap">
                    <input type="checkbox" checked={Boolean(party.isCountersigner)} onChange={(e) => setParties((current) => current.map((item) => item.id === party.id ? { ...item, isCountersigner: e.target.checked } : item))} />
                    Counter
                  </label>
                </div>
                <button type="button" onClick={() => setParties((current) => current.filter((item) => item.id !== party.id))} disabled={parties.length === 1} className="p-2 text-red-600 disabled:opacity-30">
                  <Trash2 className="w-4 h-4" />
                </button>
                <div className="md:col-span-4 text-[10px] text-neutral-500">Signing stage {index + 1}{party.isCountersigner ? ' • countersign after preceding signatories' : ''}</div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-neutral-800">Signature & text fields</h4>
                <p className="text-[11px] text-neutral-500">Use “location / purpose” to indicate where or why the signature/text appears on the execution page.</p>
              </div>
              <button type="button" onClick={() => setFields((current) => [...current, { ...newSignatureField(0), id: crypto.randomUUID(), fieldType: 'text', label: 'Commentary' }])} className="text-xs font-bold flex items-center gap-1 px-2.5 py-1.5 border border-neutral-300 rounded-lg">
                <Plus className="w-3.5 h-3.5" /> Field
              </button>
            </div>

            {fields.map((field) => (
              <div key={field.id} className="grid grid-cols-1 md:grid-cols-5 gap-2 border border-neutral-200 rounded-lg p-3">
                <select value={field.partyIndex || 0} onChange={(e) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, partyIndex: Number(e.target.value) } : item))} className="border border-neutral-300 rounded-lg px-2 py-1.5 text-xs bg-white">
                  {parties.map((party, index) => <option key={party.id} value={index}>{party.name || party.email || `Party ${index + 1}`}</option>)}
                </select>
                <select value={field.fieldType} onChange={(e) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, fieldType: e.target.value as 'signature' | 'text' } : item))} className="border border-neutral-300 rounded-lg px-2 py-1.5 text-xs bg-white">
                  <option value="signature">Signature</option>
                  <option value="text">Text commentary</option>
                </select>
                <input value={field.label} onChange={(e) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, label: e.target.value } : item))} placeholder="Field label" className="border border-neutral-300 rounded-lg px-2 py-1.5 text-xs" />
                <input value={field.placementLabel || ''} onChange={(e) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, placementLabel: e.target.value } : item))} placeholder="Location / purpose" className="border border-neutral-300 rounded-lg px-2 py-1.5 text-xs" />
                <button type="button" onClick={() => setFields((current) => current.filter((item) => item.id !== field.id))} className="p-2 text-red-600 justify-self-start">
                  <Trash2 className="w-4 h-4" />
                </button>
                {field.fieldType === 'text' && (
                  <input value={field.promptText || ''} onChange={(e) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, promptText: e.target.value } : item))} placeholder="Prompt shown to signer" className="md:col-span-5 border border-neutral-300 rounded-lg px-2 py-1.5 text-xs" />
                )}
                <div className="md:col-span-5 grid grid-cols-2 md:grid-cols-5 gap-2 pt-1">
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-[10px] font-bold text-neutral-500 mb-1">PDF page</label>
                    <input
                      type="number"
                      min={1}
                      value={field.pageNumber || ''}
                      onChange={(e) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, pageNumber: e.target.value ? Number(e.target.value) : undefined } : item))}
                      placeholder="Execution page"
                      className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 mb-1">X %</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={field.xPercent ?? ''}
                      onChange={(e) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, xPercent: e.target.value ? Number(e.target.value) : undefined } : item))}
                      placeholder="10"
                      disabled={!field.pageNumber}
                      className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-xs disabled:bg-neutral-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 mb-1">Y %</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={field.yPercent ?? ''}
                      onChange={(e) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, yPercent: e.target.value ? Number(e.target.value) : undefined } : item))}
                      placeholder="75"
                      disabled={!field.pageNumber}
                      className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-xs disabled:bg-neutral-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 mb-1">Width %</label>
                    <input
                      type="number"
                      min={5}
                      max={100}
                      value={field.widthPercent ?? ''}
                      onChange={(e) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, widthPercent: e.target.value ? Number(e.target.value) : undefined } : item))}
                      placeholder="25"
                      disabled={!field.pageNumber}
                      className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-xs disabled:bg-neutral-100"
                    />
                  </div>
                  <div className="text-[10px] text-neutral-500 flex items-end pb-1">
                    Leave page blank to place this field only on the execution page.
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-bold text-neutral-700 mb-1">Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-bold text-neutral-700 mb-1">Message</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} className="w-full border border-neutral-300 rounded-lg p-3 text-sm" />
        </div>
      </div>

      {notice && (
        <div className={`text-xs rounded-lg p-3 border ${notice.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {notice.text}
        </div>
      )}

      <button
        type="button"
        disabled={isSending}
        onClick={mode === 'send' ? sendOnly : sendForSignature}
        className="px-4 py-2.5 bg-[#0a2540] text-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50"
      >
        {mode === 'send' ? <Send className="w-4 h-4" /> : <UserRoundCheck className="w-4 h-4" />}
        {isSending ? 'Sending...' : mode === 'send' ? 'Send report' : 'Send signature request'}
      </button>

      {deliveries.length > 0 && (
        <div className="pt-4 border-t border-neutral-200">
          <h4 className="text-xs font-bold text-neutral-800 mb-2">Delivery & signing history</h4>
          <div className="space-y-2">
            {deliveries.slice(0, 8).map((delivery) => (
              <div key={delivery.id} className="text-xs border border-neutral-200 rounded-lg p-3 flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold">{delivery.deliveryMode === 'signature' ? 'Signature request' : 'Report email'}</div>
                  <div className="text-neutral-500 mt-0.5">{delivery.subject}</div>
                  {delivery.to?.length ? (
                    <div className="text-neutral-500 mt-1">
                      To: {delivery.to.map((recipient) => recipient.name || recipient.email).join(', ')}
                    </div>
                  ) : null}
                  {delivery.signatureRequest && (
                    <div className="text-neutral-500 mt-1">
                      {delivery.signatureRequest.parties.map((party) => `${party.name}: ${party.status}`).join(' • ')}
                    </div>
                  )}
                </div>
                <span className="uppercase text-[10px] font-bold bg-neutral-100 rounded-full px-2 py-1">{delivery.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

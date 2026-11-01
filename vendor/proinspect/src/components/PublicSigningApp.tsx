import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Eraser, FileSignature, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { generateReportPdf } from '../lib/reportPdf';
import type { PublicSigningPacket } from '../types/workflow';
import { ProInspectLogo } from './ProInspectLogo';

function SignaturePad({
  onChange,
}: {
  onChange: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * scale);
    canvas.height = Math.round(rect.height * scale);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(scale, scale);
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.strokeStyle = '#0a2540';
  }, []);

  const position = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    const point = position(event);
    drawingRef.current = true;
    context.beginPath();
    context.moveTo(point.x, point.y);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    const point = position(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const finish = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const dataUrl = event.currentTarget.toDataURL('image/png');
    onChange(dataUrl);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    onChange('');
  };

  return (
    <div>
      <div className="border border-neutral-300 rounded-xl bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-40 touch-none block"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={finish}
          aria-label="Signature pad"
        />
      </div>
      <button
        type="button"
        onClick={clear}
        className="mt-2 text-xs font-semibold text-neutral-600 flex items-center gap-1"
      >
        <Eraser className="w-3.5 h-3.5" /> Clear signature
      </button>
    </div>
  );
}

export const PublicSigningApp: React.FC<{ token: string }> = ({ token }) => {
  const [packet, setPacket] = useState<PublicSigningPacket | null>(null);
  const [signedName, setSignedName] = useState('');
  const [signatureText, setSignatureText] = useState('');
  const [commentary, setCommentary] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'loading' | 'ready' | 'submitting' | 'complete' | 'waiting' | 'error'>('loading');
  const [message, setMessage] = useState('');

  const storeExecutedCopy = async (executedReport: import('../types/report').ReportData) => {
    setStatus('submitting');
    setMessage('All signatures received. Preparing the fully executed copy...');
    const pdf = await generateReportPdf(executedReport, (progress) => setMessage(progress));
    await api.uploadExecutedPdf(token, pdf);
    setStatus('complete');
    setMessage('Signing is complete. A fully executed copy has been sent to all parties.');
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await api.publicSigningPacket(token);
        if (!active) return;
        setPacket(result);
        setSignedName(result.party.name);

        if (result.status === 'completed') {
          setStatus('complete');
          return;
        }

        if (result.party.status === 'signed') {
          const execution = await api.publicExecutionPayload(token);
          if (!active) return;
          if (execution.readyForExecution && execution.report) {
            await storeExecutedCopy(execution.report);
            return;
          }
          setStatus('complete');
          setMessage(
            execution.alreadyStored
              ? 'Signing is complete. The fully executed copy is available.'
              : 'Your signature has been recorded. The remaining signing workflow is still in progress.'
          );
          return;
        }

        if (!result.canSign) {
          setStatus('waiting');
        } else {
          setStatus('ready');
        }
      } catch (error: any) {
        if (!active) return;
        setMessage(error.message || 'Unable to load signing request.');
        setStatus('error');
      }
    })();

    return () => {
      active = false;
    };
  }, [token]);

  const submit = async () => {
    if (!packet || !signedName.trim() || !signatureText) return;
    setStatus('submitting');
    setMessage('');
    try {
      const result = await api.submitPublicSignature(token, {
        signedName: signedName.trim(),
        signatureText,
        commentary: commentary.trim() || undefined,
        fieldValues,
      });

      if (result.readyForExecution && result.report) {
        await storeExecutedCopy(result.report);
        return;
      }

      setPacket(result.packet || packet);
      setStatus('complete');
      setMessage('Your signature has been recorded. The next required party will be invited automatically.');
    } catch (error: any) {
      setStatus('error');
      setMessage(error.message || 'Unable to record signature.');
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-[#0a2540]" />
      </div>
    );
  }

  if (!packet) {
    return (
      <div className="min-h-screen bg-neutral-100 p-6 flex items-center justify-center">
        <div className="max-w-md bg-white border border-red-200 rounded-xl p-6 text-sm text-red-800">{message || 'Signing request unavailable.'}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900">
      <header className="bg-white border-b border-neutral-200 px-4 md:px-8 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <ProInspectLogo size="sm" showTagline={false} />
          <span className="text-xs font-semibold text-neutral-500">Secure signing</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 md:p-8 space-y-5">
        <section className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-start gap-3">
            <FileSignature className="w-6 h-6 text-[#0a2540] shrink-0" />
            <div>
              <h1 className="font-bold text-lg">{packet.reportTitle}</h1>
              <p className="text-sm text-neutral-600 mt-1">{packet.propertyAddress}</p>
              <p className="text-xs text-neutral-500 mt-2">
                Signing as <strong>{packet.party.name}</strong> — {packet.party.roleLabel}
              </p>
            </div>
          </div>

          <a
            href={api.publicSigningPdfUrl(token)}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#0a2540] border border-neutral-300 rounded-lg px-3 py-2"
          >
            <Download className="w-3.5 h-3.5" /> Review report PDF
          </a>
        </section>

        {(status === 'complete' || status === 'waiting') && (
          <section className="bg-white border border-neutral-200 rounded-xl p-5">
            <div className="flex items-center gap-2 font-bold text-neutral-900">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              {status === 'complete' ? 'Signature status recorded' : 'Waiting for another party'}
            </div>
            <p className="text-sm text-neutral-600 mt-2">
              {message || (status === 'waiting'
                ? 'This signing link is valid, but another party must sign before it is your turn.'
                : 'No further action is required from you at this time.')}
            </p>
            {packet.status === 'completed' && (
              <a
                href={api.executedPdfUrl(token)}
                className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 bg-[#0a2540] text-white rounded-lg text-xs font-bold"
              >
                <Download className="w-3.5 h-3.5" /> Download executed copy
              </a>
            )}
          </section>
        )}

        {(status === 'ready' || status === 'submitting' || status === 'error') && packet.canSign && packet.party.status !== 'signed' && (
          <section className="bg-white border border-neutral-200 rounded-xl p-5 space-y-5">
            {packet.fields.filter((field) => field.fieldType === 'text').map((field) => (
              <div key={field.id}>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  {field.label}{field.required ? ' *' : ''}
                </label>
                {field.placementLabel && <p className="text-[11px] text-neutral-500 mb-1">Location / purpose: {field.placementLabel}</p>}
                {field.promptText && <p className="text-[11px] text-neutral-500 mb-2">{field.promptText}</p>}
                <textarea
                  value={fieldValues[field.id] || ''}
                  onChange={(event) => setFieldValues((current) => ({ ...current, [field.id]: event.target.value }))}
                  rows={3}
                  className="w-full border border-neutral-300 rounded-lg p-2 text-sm"
                />
              </div>
            ))}

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">Full name *</label>
              <input
                value={signedName}
                onChange={(event) => setSignedName(event.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-2">Signature *</label>
              {packet.fields.find((field) => field.fieldType === 'signature')?.placementLabel && (
                <p className="text-[11px] text-neutral-500 mb-2">
                  Signature location / purpose: {packet.fields.find((field) => field.fieldType === 'signature')?.placementLabel}
                </p>
              )}
              <SignaturePad onChange={setSignatureText} />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">Additional commentary</label>
              <textarea
                value={commentary}
                onChange={(event) => setCommentary(event.target.value)}
                rows={3}
                placeholder="Optional comments to record with your signature"
                className="w-full border border-neutral-300 rounded-lg p-2 text-sm"
              />
            </div>

            {message && (
              <div className={`text-xs rounded-lg p-3 ${status === 'error' ? 'bg-red-50 text-red-800' : 'bg-blue-50 text-blue-800'}`}>
                {message}
              </div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={status === 'submitting' || !signedName.trim() || !signatureText}
              className="w-full px-4 py-3 bg-[#0a2540] text-white rounded-lg font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {status === 'submitting' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />}
              {status === 'submitting' ? 'Recording signature...' : 'Confirm and sign'}
            </button>

            <p className="text-[11px] text-neutral-500">
              By selecting “Confirm and sign”, you confirm that the signature you provide is intended to be applied to this report and that the information you submit may be recorded with the execution history.
            </p>
          </section>
        )}
      </main>
    </div>
  );
};

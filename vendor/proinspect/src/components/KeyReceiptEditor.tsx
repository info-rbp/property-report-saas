import React from 'react';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { InspectionArea, InspectionItem, ReportPhoto, TenancyDetails } from '../types/report';
import { ItemWorkflowControls } from './ItemWorkflowControls';

interface Props {
  details: TenancyDetails;
  areas: InspectionArea[];
  photos: ReportPhoto[];
  onChangeDetails: (details: TenancyDetails) => void;
  onChangeAreas: (areas: InspectionArea[]) => void;
  onChangePhotos: (photos: ReportPhoto[]) => void;
  onUploadPhotos: (files: File[], areaName: string, itemId?: string, areaId?: string) => Promise<void>;
}

const STANDARD_KEYS = [
  'Front Door Key',
  'Security / Screen Door Key',
  'Rear / Side Door Key',
  'Garage Door Key',
  'Garage Remote',
  'Mailbox Key',
  'Storage / Shed Key',
  'Access Fob / Swipe Card',
  'Common Area / Building Key',
];

export const KeyReceiptEditor: React.FC<Props> = ({
  details,
  areas,
  photos,
  onChangeDetails,
  onChangeAreas,
  onChangePhotos,
  onUploadPhotos,
}) => {
  const keyArea = areas[0] || {
    id: `area-${crypto.randomUUID()}`,
    name: 'Keys / Access Devices Received',
    items: [],
  };

  const setDetail = (key: keyof TenancyDetails, value: string) => {
    onChangeDetails({ ...details, [key]: value });
  };

  const replaceKeyArea = (nextArea: InspectionArea) => {
    if (areas.length === 0) {
      onChangeAreas([nextArea]);
      return;
    }
    onChangeAreas([nextArea, ...areas.slice(1)]);
  };

  const addItem = (name = '') => {
    const item: InspectionItem = {
      id: `key-item-${crypto.randomUUID()}`,
      name,
      quantity: '',
      identifier: '',
      agentComments: '',
      isCustom: true,
    };
    replaceKeyArea({ ...keyArea, items: [...keyArea.items, item] });
  };

  const updateItem = (itemId: string, patch: Partial<InspectionItem>) => {
    replaceKeyArea({
      ...keyArea,
      items: keyArea.items.map((item) => item.id === itemId ? { ...item, ...patch } : item),
    });
    if (typeof patch.name === 'string') {
      onChangePhotos(
        photos.map((photo) =>
          photo.itemId === itemId ? { ...photo, itemName: patch.name } : photo
        )
      );
    }
  };

  const deleteItem = (itemId: string) => {
    if (photos.some((photo) => photo.itemId === itemId)) {
      alert('This key / access device still has linked photos. Reassign or delete those photos before removing the item.');
      return;
    }
    replaceKeyArea({
      ...keyArea,
      items: keyArea.items.filter((item) => item.id !== itemId),
    });
  };

  const addStandardItem = (name: string) => {
    if (keyArea.items.some((item) => item.name.trim().toLowerCase() === name.toLowerCase())) return;
    addItem(name);
  };

  return (
    <div className="bg-white rounded-xl shadow-xs border border-neutral-200 overflow-hidden h-full overflow-y-auto">
      <div className="p-4 md:p-6 space-y-6">
        <div className="border-b border-neutral-200 pb-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-cyan-700" />
            <h2 className="font-bold text-neutral-900">Key Receipt</h2>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Record the keys and access devices handed to the tenant. The issued PDF includes a tenant acknowledgement and signature section.
          </p>
        </div>

        <section className="space-y-3">
          <h3 className="font-bold text-sm text-neutral-900">Handover details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="md:col-span-2">
              <label className="block font-semibold text-neutral-700 mb-1">Property Address</label>
              <input
                value={details.propertyAddress}
                onChange={(event) => setDetail('propertyAddress', event.target.value)}
                className="w-full border border-neutral-300 rounded-lg p-2 font-semibold"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block font-semibold text-neutral-700 mb-1">Tenant / Recipient</label>
              <input
                value={details.tenants}
                onChange={(event) => setDetail('tenants', event.target.value)}
                placeholder="e.g. John Smith & Jane Smith"
                className="w-full border border-neutral-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Tenancy Commencement Date</label>
              <input
                type="date"
                value={details.tenancyStartDate}
                onChange={(event) => setDetail('tenancyStartDate', event.target.value)}
                className="w-full border border-neutral-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Date Keys / Devices Received</label>
              <input
                type="date"
                value={details.inspectionDate}
                onChange={(event) => setDetail('inspectionDate', event.target.value)}
                className="w-full border border-neutral-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Time Received</label>
              <input
                value={details.keyReceiptTime || ''}
                onChange={(event) => setDetail('keyReceiptTime', event.target.value)}
                placeholder="e.g. 2:30 pm"
                className="w-full border border-neutral-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Issued By</label>
              <input
                value={details.inspectingAgent}
                onChange={(event) => setDetail('inspectingAgent', event.target.value)}
                className="w-full border border-neutral-300 rounded-lg p-2"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block font-semibold text-neutral-700 mb-1">Reference</label>
              <input
                value={details.referenceNumber || ''}
                onChange={(event) => setDetail('referenceNumber', event.target.value)}
                placeholder="Optional property / tenancy reference"
                className="w-full border border-neutral-300 rounded-lg p-2"
              />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap justify-between gap-3 items-start">
            <div>
              <h3 className="font-bold text-sm text-neutral-900">Keys & access devices received</h3>
              <p className="text-xs text-neutral-500 mt-1">Add only the items actually handed to the tenant. Photos can be uploaded, dropped or taken directly against the relevant key or access device.</p>
            </div>
            <button
              onClick={() => addItem()}
              className="px-3 py-1.5 bg-[#0a2540] text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add Item
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {STANDARD_KEYS.map((name) => (
              <button
                key={name}
                onClick={() => addStandardItem(name)}
                className="px-2 py-1 text-[10px] border border-neutral-300 bg-white rounded-md text-neutral-700"
              >
                + {name}
              </button>
            ))}
          </div>

          {keyArea.items.length === 0 ? (
            <div className="border border-dashed border-neutral-300 rounded-xl p-8 text-center text-xs text-neutral-500">
              No keys or access devices recorded yet.
            </div>
          ) : (
            <div className="border border-neutral-300 rounded-xl overflow-hidden">
              <div className="hidden md:grid grid-cols-[90px_1fr_1.2fr_44px] bg-neutral-100 text-[10px] font-bold uppercase tracking-wide text-neutral-600">
                <div className="p-2 border-r">Quantity</div>
                <div className="p-2 border-r">Key / Access Device</div>
                <div className="p-2 border-r">Identifier / Notes</div>
                <div />
              </div>
              <div className="divide-y divide-neutral-200">
                {keyArea.items.map((item) => (
                  <div key={item.id} className="p-3 md:p-0">
                    <div className="grid grid-cols-1 md:grid-cols-[90px_1fr_1.2fr_44px] gap-2 md:gap-0 text-xs">
                      <div className="md:p-2 md:border-r">
                        <label className="md:hidden block text-[10px] font-bold text-neutral-500 mb-1">Quantity</label>
                        <input
                          value={item.quantity || ''}
                          onChange={(event) => updateItem(item.id, { quantity: event.target.value })}
                          inputMode="numeric"
                          placeholder="1"
                          className="w-full border border-neutral-300 rounded-lg p-2"
                        />
                      </div>
                      <div className="md:p-2 md:border-r">
                        <label className="md:hidden block text-[10px] font-bold text-neutral-500 mb-1">Key / Access Device</label>
                        <input
                          value={item.name}
                          onChange={(event) => updateItem(item.id, { name: event.target.value })}
                          placeholder="e.g. Front Door Key"
                          className="w-full border border-neutral-300 rounded-lg p-2 font-semibold"
                        />
                      </div>
                      <div className="md:p-2 md:border-r">
                        <label className="md:hidden block text-[10px] font-bold text-neutral-500 mb-1">Identifier / Notes</label>
                        <input
                          value={item.identifier || ''}
                          onChange={(event) => updateItem(item.id, { identifier: event.target.value })}
                          placeholder="Optional number, colour or identifying note"
                          className="w-full border border-neutral-300 rounded-lg p-2"
                        />
                      </div>
                      <div className="md:p-2 flex items-start justify-end">
                        <button
                          onClick={() => deleteItem(item.id)}
                          className="p-1 text-neutral-400 hover:text-red-600"
                          title="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="md:px-2 md:pb-3">
                      <ItemWorkflowControls
                        area={keyArea}
                        item={item}
                        photos={photos}
                        maintenanceEnabled={false}
                        showActionTracking={false}
                        showGeneralPhotoControls={true}
                        onChangeItem={(patch) => updateItem(item.id, patch)}
                        onUploadPhotos={onUploadPhotos}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section>
          <label className="block text-xs font-semibold text-neutral-700 mb-1">Handover Notes / Comments</label>
          <textarea
            value={details.additionalComments}
            onChange={(event) => setDetail('additionalComments', event.target.value)}
            rows={4}
            placeholder="Optional notes about the handover."
            className="w-full border border-neutral-300 rounded-lg p-2 text-xs"
          />
        </section>

        <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-3 text-xs text-cyan-950">
          The PDF will present the tenant name(s) as the signatory name(s) and leave signature/date lines blank for signing.
        </div>
      </div>
    </div>
  );
};

import React, { useRef } from 'react';
import { Camera, ImagePlus, Wrench } from 'lucide-react';
import type { InspectionArea, InspectionItem, ReportPhoto } from '../types/report';
import { imageFilesFromList, REPORT_IMAGE_ACCEPT } from '../lib/photoDrop';

interface Props {
  area: InspectionArea;
  item: InspectionItem;
  photos: ReportPhoto[];
  maintenanceEnabled: boolean;
  showActionTracking?: boolean;
  showGeneralPhotoControls?: boolean;
  enableDropZone?: boolean;
  onChangeItem: (patch: Partial<InspectionItem>) => void;
  onUploadPhotos: (files: File[], areaName: string, itemId?: string, areaId?: string) => Promise<void>;
}

const STATUS_OPTIONS = [
  'Open',
  'In Progress',
  'Awaiting Contractor',
  'Awaiting Quote',
  'Awaiting Approval',
  'Scheduled',
  'Monitoring',
  'Completed',
  'Closed',
];

export const ItemWorkflowControls: React.FC<Props> = ({
  area,
  item,
  photos,
  maintenanceEnabled,
  showActionTracking = false,
  showGeneralPhotoControls = true,
  enableDropZone = true,
  onChangeItem,
  onUploadPhotos,
}) => {
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const itemPhotos = photos.filter((photo) => photo.itemId === item.id);

  const uploadFiles = (files: FileList | null) => {
    const selected = imageFilesFromList(files);
    if (!selected.length) return;
    void onUploadPhotos(selected, area.name, item.id, area.id);
  };

  return (
    <div
      className="mt-3 space-y-3"
      onDragOver={enableDropZone ? (event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      } : undefined}
      onDrop={enableDropZone ? (event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        event.stopPropagation();
        const files = imageFilesFromList(event.dataTransfer.files);
        if (files.length) void onUploadPhotos(files, area.name, item.id, area.id);
      } : undefined}
    >
      <input
        ref={uploadRef}
        type="file"
        accept={REPORT_IMAGE_ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => {
          uploadFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          uploadFiles(event.target.files);
          event.target.value = '';
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        {showGeneralPhotoControls && (
          <>
            <span className="text-[10px] font-semibold text-cyan-800 bg-cyan-50 border border-cyan-200 rounded-lg px-2 py-1.5">
              {itemPhotos.length} item photo{itemPhotos.length === 1 ? '' : 's'} • drop photos here
            </span>
            <button
              type="button"
              onClick={() => uploadRef.current?.click()}
              className="px-2.5 py-1.5 rounded-lg border border-neutral-300 bg-white text-[10px] font-bold flex items-center gap-1"
            >
              <ImagePlus className="w-3 h-3" /> Upload Photos
            </button>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="px-2.5 py-1.5 rounded-lg bg-[#0a2540] text-white text-[10px] font-bold flex items-center gap-1"
            >
              <Camera className="w-3 h-3" /> Take Photo
            </button>
          </>
        )}

        {maintenanceEnabled && (
          <label className={`ml-auto inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold cursor-pointer ${
            item.maintenanceRequired
              ? 'bg-amber-50 border-amber-300 text-amber-900'
              : 'bg-white border-neutral-300 text-neutral-700'
          }`}>
            <input
              type="checkbox"
              checked={Boolean(item.maintenanceRequired)}
              onChange={(event) => onChangeItem({ maintenanceRequired: event.target.checked })}
            />
            <Wrench className="w-3.5 h-3.5" />
            Flag as Maintenance
          </label>
        )}
      </div>

      {showActionTracking && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>
            <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">Responsible Party</label>
            <input
              value={item.activityParty || ''}
              onChange={(event) => onChangeItem({ activityParty: event.target.value })}
              className="w-full border border-neutral-300 rounded-lg p-2 text-xs"
              placeholder="Contractor / staff / client"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">Status</label>
            <select
              value={item.status || 'Open'}
              onChange={(event) => onChangeItem({ status: event.target.value })}
              className="w-full border border-neutral-300 rounded-lg p-2 text-xs bg-white"
            >
              {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">Due Date</label>
            <input
              type="date"
              value={item.dueDate || ''}
              onChange={(event) => onChangeItem({ dueDate: event.target.value })}
              className="w-full border border-neutral-300 rounded-lg p-2 text-xs"
            />
          </div>
        </div>
      )}

      {maintenanceEnabled && item.maintenanceRequired && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-black uppercase text-amber-900 flex items-center gap-1">
                <Wrench className="w-3.5 h-3.5" /> Maintenance Register Commentary
              </div>
              <div className="text-[10px] text-amber-800 mt-0.5">
                This finding will also appear under Maintenance at the end of the report.
              </div>
            </div>
            <div className="text-[10px] font-semibold text-amber-900">{itemPhotos.length} evidence photo{itemPhotos.length === 1 ? '' : 's'}</div>
          </div>
          <textarea
            value={item.maintenanceCommentary || ''}
            onChange={(event) => onChangeItem({ maintenanceCommentary: event.target.value })}
            rows={3}
            className="w-full border border-amber-300 rounded-lg p-2 text-xs bg-white"
            placeholder="Describe the maintenance issue, required repair, recommended next step or contractor instruction..."
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => uploadRef.current?.click()}
              className="px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white text-amber-900 text-[10px] font-bold flex items-center gap-1"
            >
              <ImagePlus className="w-3 h-3" /> Add Maintenance Photo
            </button>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="px-2.5 py-1.5 rounded-lg bg-amber-900 text-white text-[10px] font-bold flex items-center gap-1"
            >
              <Camera className="w-3 h-3" /> Take Maintenance Photo
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

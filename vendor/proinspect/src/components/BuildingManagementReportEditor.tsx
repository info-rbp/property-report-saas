import React, { useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Building2, Camera, ChevronDown, ChevronRight, ClipboardList, Plus, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { getReportTemplate, supportsMaintenanceRegister } from '../data/reportCatalogue';
import { normalizeAreaName } from '../lib/reportFormatting';
import { imageFilesFromList } from '../lib/photoDrop';
import { ItemWorkflowControls } from './ItemWorkflowControls';
import { InspectionArea, InspectionItem, ReportPhoto, TenancyDetails } from '../types/report';

interface Props {
  details: TenancyDetails;
  areas: InspectionArea[];
  photos: ReportPhoto[];
  pendingPhotoUploads?: number;
  onUploadPhotos: (files: File[], areaName: string, itemId?: string, areaId?: string) => Promise<void>;
  onChangeDetails: (details: TenancyDetails) => void;
  onChangeAreas: (areas: InspectionArea[]) => void;
  onChangePhotos: (photos: ReportPhoto[]) => void;
}

export const BuildingManagementReportEditor: React.FC<Props> = ({
  details,
  areas,
  photos,
  pendingPhotoUploads = 0,
  onUploadPhotos,
  onChangeDetails,
  onChangeAreas,
  onChangePhotos,
}) => {
  const template = getReportTemplate(details.reportType);
  const isDaily = details.reportType === 'BuildingManagementDaily';
  const monthlyPilot = details.reportType === 'BuildingManagementMonthly';
  const updatedBusinessManagement = details.reportType === 'UpdatedBusinessManagement';
  const maintenanceEnabled = supportsMaintenanceRegister(details.reportType);
  const supportsItemReorder = monthlyPilot || updatedBusinessManagement;
  const statusOptions = [
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
  const [tab, setTab] = useState<'activities' | 'details' | 'summary'>('activities');
  const [expandedAreaId, setExpandedAreaId] = useState<string | null>(areas[0]?.id || null);
  const [categoryNameDrafts, setCategoryNameDrafts] = useState<Record<string, string>>({});
  const [photoDropTarget, setPhotoDropTarget] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [cameraTarget, setCameraTarget] = useState<{ areaId: string; areaName: string; itemId: string } | null>(null);

  const itemPhotoCounts = useMemo(() => {
    const counts = new Map<string, number>();
    photos.forEach((photo) => {
      if (!photo.itemId) return;
      counts.set(photo.itemId, (counts.get(photo.itemId) || 0) + 1);
    });
    return counts;
  }, [photos]);

  const openItemCamera = (area: InspectionArea, itemId: string) => {
    setCameraTarget({ areaId: area.id, areaName: area.name, itemId });
    cameraInputRef.current?.click();
  };

  const handleCameraCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length || !cameraTarget) return;
    void onUploadPhotos(files, cameraTarget.areaName, cameraTarget.itemId, cameraTarget.areaId);
  };

  const droppedImageFiles = (event: React.DragEvent): File[] =>
    imageFilesFromList(event.dataTransfer.files);

  const queueDroppedPhotos = (
    event: React.DragEvent,
    area: InspectionArea,
    itemId?: string
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setPhotoDropTarget(null);
    const files = droppedImageFiles(event);
    if (!files.length) return;
    void onUploadPhotos(files, area.name, itemId, area.id);
  };

  const updateDetail = (key: keyof TenancyDetails, value: string) => {
    onChangeDetails({ ...details, [key]: value });
  };

  const updateItem = (areaId: string, itemId: string, patch: Partial<InspectionItem>) => {
    onChangeAreas(
      areas.map((area) =>
        area.id !== areaId
          ? area
          : {
              ...area,
              items: area.items.map((item) => item.id === itemId ? { ...item, ...patch } : item),
            }
      )
    );
  };

  const moveItem = (areaId: string, itemId: string, direction: 'up' | 'down') => {
    onChangeAreas(
      areas.map((area) => {
        if (area.id !== areaId) return area;
        const currentIndex = area.items.findIndex((item) => item.id === itemId);
        const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (currentIndex < 0 || nextIndex < 0 || nextIndex >= area.items.length) return area;

        const items = [...area.items];
        [items[currentIndex], items[nextIndex]] = [items[nextIndex], items[currentIndex]];
        return { ...area, items };
      })
    );
  };

  const moveCategory = (areaId: string, direction: 'up' | 'down') => {
    const currentIndex = areas.findIndex((area) => area.id === areaId);
    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= areas.length) return;

    const nextAreas = [...areas];
    [nextAreas[currentIndex], nextAreas[nextIndex]] = [nextAreas[nextIndex], nextAreas[currentIndex]];
    onChangeAreas(nextAreas);
  };

  const commitCategoryName = (area: InspectionArea) => {
    const draft = categoryNameDrafts[area.id];
    if (draft === undefined) return;

    const name = draft.trim();
    if (!name) {
      alert('Category name cannot be blank.');
      setCategoryNameDrafts((current) => {
        const next = { ...current };
        delete next[area.id];
        return next;
      });
      return;
    }

    const normalized = normalizeAreaName(name);
    const duplicate = areas.some(
      (candidate) => candidate.id !== area.id && normalizeAreaName(candidate.name) === normalized
    );
    if (duplicate) {
      alert(`A category named "${name}" already exists. Category names must be unique.`);
      setCategoryNameDrafts((current) => {
        const next = { ...current };
        delete next[area.id];
        return next;
      });
      return;
    }

    if (name !== area.name) {
      const oldAreaKey = normalizeAreaName(area.name);
      const linkedItemIds = new Set(area.items.map((item) => item.id));

      onChangeAreas(
        areas.map((candidate) => candidate.id === area.id ? { ...candidate, name } : candidate)
      );
      onChangePhotos(
        photos.map((photo) =>
          (photo.itemId && linkedItemIds.has(photo.itemId)) ||
          normalizeAreaName(photo.areaName || '') === oldAreaKey
            ? { ...photo, areaName: name }
            : photo
        )
      );
    }

    setCategoryNameDrafts((current) => {
      const next = { ...current };
      delete next[area.id];
      return next;
    });
  };

  const addItem = (areaId: string) => {
    const newItem: InspectionItem = {
      id: `bm-item-${crypto.randomUUID()}`,
      name: '',
      activityDate: isDaily ? details.inspectionDate : '',
      activityTime: '',
      activityParty: '',
      agentComments: '',
      actionComments: '',
      status: updatedBusinessManagement ? 'Open' : undefined,
      dueDate: '',
    };
    onChangeAreas(
      areas.map((area) => area.id === areaId ? { ...area, items: [...area.items, newItem] } : area)
    );
    setExpandedAreaId(areaId);
  };

  const deleteItem = (areaId: string, itemId: string) => {
    const linked = itemPhotoCounts.get(itemId) || 0;
    if (linked > 0) {
      alert(`This reporting item has ${linked} linked photo${linked === 1 ? '' : 's'}. Reassign or delete those photos before removing the item.`);
      return;
    }
    onChangeAreas(
      areas.map((area) =>
        area.id === areaId ? { ...area, items: area.items.filter((item) => item.id !== itemId) } : area
      )
    );
  };

  const addCategory = () => {
    const name = prompt('Enter the new Building Management report category:')?.trim();
    if (!name) return;
    if (areas.some((area) => normalizeAreaName(area.name) === normalizeAreaName(name))) {
      alert(`A category named "${name}" already exists. Category names must be unique.`);
      return;
    }
    const area: InspectionArea = {
      id: `bm-area-${crypto.randomUUID()}`,
      name,
      items: [],
    };
    onChangeAreas([...areas, area]);
    setExpandedAreaId(area.id);
  };

  const deleteCategory = (area: InspectionArea) => {
    const linkedItemIds = new Set(area.items.map((item) => item.id));
    const areaKey = normalizeAreaName(area.name);
    const linked = photos.filter(
      (photo) =>
        (photo.itemId && linkedItemIds.has(photo.itemId)) ||
        normalizeAreaName(photo.areaName || '') === areaKey
    ).length;
    if (linked > 0) {
      alert(`This category has ${linked} linked photo${linked === 1 ? '' : 's'}. Reassign or delete those photos before removing the category.`);
      return;
    }
    if (!confirm(`Remove the "${area.name}" category and all of its reporting items?`)) return;
    onChangeAreas(areas.filter((item) => item.id !== area.id));
  };

  const detailFields: Array<[keyof TenancyDetails, string, string?]> = [
    ['buildingName', 'Building / Scheme Name', 'e.g. Meridian'],
    ['strataPlan', 'Strata Plan / Scheme Reference', 'e.g. Strata Plan 69776'],
    ['propertyAddress', 'Building / Site Address', ''],
    ...(isDaily
      ? [['inspectionDate', 'Report Date', 'DD/MM/YYYY'] as [keyof TenancyDetails, string, string]]
      : [
          ['reportingPeriod', 'Reporting Period', 'e.g. April 2026'] as [keyof TenancyDetails, string, string],
          ['inspectionDate', 'Report Issue Date', 'DD/MM/YYYY'] as [keyof TenancyDetails, string, string],
        ]),
    ['inspectingAgent', 'Building Manager / Prepared By', ''],
    ['clientName', 'Client / Council / Principal', ''],
  ];

  const summaryFields: Array<[keyof TenancyDetails, string, number]> = isDaily
    ? [
        ['buildingSummary', 'Daily Summary', 5],
        ['outstandingItems', 'Outstanding Works / Issues', 5],
        ['mattersForApproval', 'Matters Requiring Approval / Escalation', 4],
        ['additionalComments', 'Additional Comments', 4],
      ]
    : updatedBusinessManagement
    ? [
        ['buildingSummary', 'Overall Management Summary', 5],
        ['outstandingItems', 'Outstanding Works / Issues', 5],
        ['mattersForApproval', 'Matters Requiring Approval', 4],
        ['recommendedAction', 'Planned / Next Period Actions', 4],
        ['additionalComments', 'Additional Comments', 4],
      ]
    : [
        ['buildingSummary', 'Overall Monthly Summary', 5],
        ['outstandingItems', 'Outstanding Works / Issues', 5],
        ['mattersForApproval', 'Matters Requiring Approval', 4],
        ['recommendedAction', 'Planned / Next Period Actions', 4],
        ['additionalComments', 'Additional Comments', 4],
      ];

  return (
    <div className="bg-white rounded-xl shadow-xs border border-neutral-200 overflow-hidden flex flex-col h-full">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCameraCapture}
        className="hidden"
      />
      <div className="flex border-b border-neutral-200 bg-neutral-50 px-4 overflow-x-auto">
        <button
          onClick={() => setTab('activities')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap ${tab === 'activities' ? 'border-neutral-900 text-neutral-900 bg-white' : 'border-transparent text-neutral-500'}`}
        >
          <ClipboardList className="w-3.5 h-3.5" /> {isDaily ? 'Daily Activities' : updatedBusinessManagement ? 'Management Register' : 'Monthly Activities'}
        </button>
        <button
          onClick={() => setTab('details')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap ${tab === 'details' ? 'border-neutral-900 text-neutral-900 bg-white' : 'border-transparent text-neutral-500'}`}
        >
          <Building2 className="w-3.5 h-3.5" /> Report Details
        </button>
        <button
          onClick={() => setTab('summary')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap ${tab === 'summary' ? 'border-neutral-900 text-neutral-900 bg-white' : 'border-transparent text-neutral-500'}`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-700" /> Summary & Sign-off
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-neutral-50/50">
        {tab === 'activities' && (
          <div className="space-y-4">
            <div className="bg-white border border-neutral-200 rounded-lg p-3 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-neutral-900">{template.findingsTitle}</h3>
                <p className="text-xs text-neutral-500 mt-1">
                  {updatedBusinessManagement
                    ? 'Use the broad management categories below and record each matter as Date, Item, Description / Action, Responsible Party, Status and Due Date. Photos can be dropped or captured directly against the relevant item.'
                    : 'Rename and reorder categories, then add reporting items. Drag image files directly onto a category for category-level evidence or onto a reporting item for item-specific evidence. Uploads run in the background, so you can continue editing and queue files to other destinations.'}
                </p>
                {pendingPhotoUploads > 0 && (
                  <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-900 text-[11px] font-semibold">
                    <Upload className="w-3 h-3" />
                    {pendingPhotoUploads} photo{pendingPhotoUploads === 1 ? '' : 's'} queued/uploading
                  </div>
                )}
              </div>
              <button onClick={addCategory} className="px-3 py-1.5 bg-[#0a2540] text-white rounded-lg text-xs font-bold flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add Category
              </button>
            </div>

            {areas.map((area, areaIndex) => {
              const expanded = expandedAreaId === area.id;
              return (
                <div
                  key={area.id}
                  className={`border rounded-xl bg-white overflow-hidden transition-colors ${
                    photoDropTarget === `area:${area.id}`
                      ? 'border-cyan-500 ring-2 ring-cyan-200'
                      : 'border-neutral-300'
                  }`}
                  onDragOver={(event) => {
                    if (!event.dataTransfer.types.includes('Files')) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'copy';
                    setPhotoDropTarget(`area:${area.id}`);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setPhotoDropTarget((current) => current === `area:${area.id}` ? null : current);
                    }
                  }}
                  onDrop={(event) => queueDroppedPhotos(event, area)}
                >
                  <div
                    className="p-3 bg-neutral-100 flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedAreaId(expanded ? null : area.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {expanded ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                      <input
                        value={categoryNameDrafts[area.id] ?? area.name}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) =>
                          setCategoryNameDrafts((current) => ({ ...current, [area.id]: event.target.value }))
                        }
                        onBlur={() => commitCategoryName(area)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                        }}
                        aria-label="Category name"
                        title="Edit category name"
                        className="min-w-0 w-full max-w-md bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 font-black text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                      />
                      <span className="text-[11px] bg-neutral-200 px-2 py-0.5 rounded-full whitespace-nowrap">{area.items.length} reporting items</span>
                    </div>
                    <div
                      className="flex items-center gap-1.5"
                      onClick={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.preventDefault()}
                    >
                      <button
                        type="button"
                        onClick={() => moveCategory(area.id, 'up')}
                        disabled={areaIndex === 0}
                        aria-label="Move category up"
                        title="Move category up"
                        className="p-1.5 text-neutral-500 hover:text-neutral-900 disabled:opacity-25 disabled:cursor-not-allowed"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveCategory(area.id, 'down')}
                        disabled={areaIndex === areas.length - 1}
                        aria-label="Move category down"
                        title="Move category down"
                        className="p-1.5 text-neutral-500 hover:text-neutral-900 disabled:opacity-25 disabled:cursor-not-allowed"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button onClick={() => addItem(area.id)} className="px-2.5 py-1 text-xs border border-neutral-300 rounded bg-white font-semibold">
                        + Reporting Item
                      </button>
                      <span
                        className="hidden lg:inline-flex items-center gap-1 px-2 py-1 rounded bg-cyan-50 border border-cyan-200 text-cyan-800 text-[10px] font-semibold"
                        title="Drop image files anywhere on this category header for category-level evidence"
                      >
                        <Upload className="w-3 h-3" /> Drop category photos
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteCategory(area)}
                        aria-label="Delete category"
                        title="Delete category"
                        className="p-1.5 text-neutral-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="divide-y divide-neutral-200">
                      {area.items.length === 0 && (
                        <div className="p-5 text-xs text-neutral-500 text-center">
                          No activities recorded in this category. Add a reporting item when there is something to report.
                        </div>
                      )}

                      {area.items.map((item, itemIndex) => {
                        const linkedPhotos = itemPhotoCounts.get(item.id) || 0;
                        return (
                          <div
                            key={item.id}
                            className={`p-4 space-y-3 transition-colors ${
                              photoDropTarget === `item:${item.id}`
                                ? 'bg-cyan-50/70 ring-2 ring-inset ring-cyan-300'
                                : ''
                            }`}
                            onDragOver={(event) => {
                              if (!event.dataTransfer.types.includes('Files')) return;
                              event.preventDefault();
                              event.stopPropagation();
                              event.dataTransfer.dropEffect = 'copy';
                              setPhotoDropTarget(`item:${item.id}`);
                            }}
                            onDragLeave={(event) => {
                              event.stopPropagation();
                              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                                setPhotoDropTarget((current) => current === `item:${item.id}` ? null : current);
                              }
                            }}
                            onDrop={(event) => queueDroppedPhotos(event, area, item.id)}
                          >
                            {updatedBusinessManagement ? (
                              <>
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                                  <div className="md:col-span-2">
                                    <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">Date</label>
                                    <input
                                      type="date"
                                      value={item.activityDate || ''}
                                      onChange={(event) => updateItem(area.id, item.id, { activityDate: event.target.value })}
                                      className="w-full border border-neutral-300 rounded-lg p-2 text-xs"
                                    />
                                  </div>
                                  <div className="md:col-span-4">
                                    <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">Item</label>
                                    <input
                                      value={item.name}
                                      onChange={(event) => updateItem(area.id, item.id, { name: event.target.value })}
                                      className="w-full border border-neutral-300 rounded-lg p-2 text-xs font-semibold"
                                      placeholder="Short subject / matter"
                                    />
                                  </div>
                                  <div className="md:col-span-3">
                                    <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">Responsible Party</label>
                                    <input
                                      value={item.activityParty || ''}
                                      onChange={(event) => updateItem(area.id, item.id, { activityParty: event.target.value })}
                                      className="w-full border border-neutral-300 rounded-lg p-2 text-xs"
                                      placeholder="e.g. Building Manager / ABC Roofing"
                                    />
                                  </div>
                                  <div className="md:col-span-3">
                                    <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">Status</label>
                                    <select
                                      value={item.status || 'Open'}
                                      onChange={(event) => updateItem(area.id, item.id, { status: event.target.value })}
                                      className="w-full border border-neutral-300 rounded-lg p-2 text-xs bg-white"
                                    >
                                      {statusOptions.map((status) => (
                                        <option key={status} value={status}>{status}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">Description / Action</label>
                                  <textarea
                                    value={item.agentComments}
                                    onChange={(event) => updateItem(area.id, item.id, { agentComments: event.target.value, actionComments: '' })}
                                    rows={5}
                                    className="w-full border border-neutral-300 rounded-lg p-2 text-xs"
                                    placeholder="Describe the matter, what occurred or was observed, action already taken, and the required next step..."
                                  />
                                </div>

                                <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
                                  <div className="w-full md:w-52">
                                    <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">Due Date</label>
                                    <input
                                      type="date"
                                      value={item.dueDate || ''}
                                      onChange={(event) => updateItem(area.id, item.id, { dueDate: event.target.value })}
                                      className="w-full border border-neutral-300 rounded-lg p-2 text-xs"
                                    />
                                  </div>

                                  <div className="flex flex-wrap items-center justify-end gap-2">
                                    <div
                                      className="text-[10px] font-semibold text-cyan-800 bg-cyan-50 border border-cyan-200 rounded-lg px-2 py-2 flex items-center gap-1.5"
                                      title="Drop image files anywhere on this reporting item"
                                    >
                                      <Camera className="w-3.5 h-3.5" /> {linkedPhotos} photo{linkedPhotos === 1 ? '' : 's'}
                                      <span className="text-[9px] text-cyan-700">• Drop photos</span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => openItemCamera(area, item.id)}
                                      className="px-2.5 py-2 rounded-lg bg-[#0a2540] text-white text-[10px] font-bold flex items-center gap-1"
                                      title="Open the phone camera and attach the photo to this reporting item"
                                    >
                                      <Camera className="w-3 h-3" /> Take Photo
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => moveItem(area.id, item.id, 'up')}
                                      disabled={itemIndex === 0}
                                      aria-label="Move reporting item up"
                                      title="Move reporting item up"
                                      className="p-2 text-neutral-500 hover:text-neutral-900 disabled:opacity-25 disabled:cursor-not-allowed"
                                    >
                                      <ArrowUp className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => moveItem(area.id, item.id, 'down')}
                                      disabled={itemIndex === area.items.length - 1}
                                      aria-label="Move reporting item down"
                                      title="Move reporting item down"
                                      className="p-2 text-neutral-500 hover:text-neutral-900 disabled:opacity-25 disabled:cursor-not-allowed"
                                    >
                                      <ArrowDown className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deleteItem(area.id, item.id)}
                                      aria-label="Delete reporting item"
                                      title="Delete reporting item"
                                      className="p-2 text-neutral-300 hover:text-red-600"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                                  <div className="md:col-span-2">
                                    <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">
                                      {isDaily ? 'Time' : 'Date'}
                                    </label>
                                    <input
                                      value={isDaily ? item.activityTime || '' : item.activityDate || ''}
                                      onChange={(event) => updateItem(area.id, item.id, isDaily ? { activityTime: event.target.value } : { activityDate: event.target.value })}
                                      className="w-full border border-neutral-300 rounded-lg p-2 text-xs"
                                      placeholder={isDaily ? 'e.g. 10:30 am' : 'DD/MM/YYYY'}
                                    />
                                  </div>
                                  <div className="md:col-span-3">
                                    <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">Contractor / Resident / Party</label>
                                    <input
                                      value={item.activityParty || ''}
                                      onChange={(event) => updateItem(area.id, item.id, { activityParty: event.target.value })}
                                      className="w-full border border-neutral-300 rounded-lg p-2 text-xs"
                                      placeholder="e.g. Rescom Electrical"
                                    />
                                  </div>
                                  <div className="md:col-span-5">
                                    <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">Reporting Item</label>
                                    <input
                                      value={item.name}
                                      onChange={(event) => updateItem(area.id, item.id, { name: event.target.value })}
                                      className="w-full border border-neutral-300 rounded-lg p-2 text-xs font-semibold"
                                      placeholder="Short description / subject"
                                    />
                                  </div>
                                  <div className="md:col-span-2 flex items-end justify-between gap-2">
                                    <div className="flex flex-col gap-1">
                                      <div
                                        className="text-[10px] font-semibold text-cyan-800 bg-cyan-50 border border-cyan-200 rounded-lg px-2 py-2 flex flex-col items-center gap-0.5"
                                        title="Drop image files anywhere on this reporting item"
                                      >
                                        <span className="flex items-center gap-1"><Camera className="w-3.5 h-3.5" /> {linkedPhotos} linked</span>
                                        <span className="flex items-center gap-1 text-[9px]"><Upload className="w-3 h-3" /> Drop photos</span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => openItemCamera(area, item.id)}
                                        className="px-2 py-1.5 rounded-lg bg-[#0a2540] text-white text-[10px] font-bold flex items-center justify-center gap-1"
                                        title="Open the phone camera and attach the photo to this reporting item"
                                      >
                                        <Camera className="w-3 h-3" /> Take Photo
                                      </button>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {supportsItemReorder && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => moveItem(area.id, item.id, 'up')}
                                            disabled={itemIndex === 0}
                                            aria-label="Move reporting item up"
                                            title="Move reporting item up"
                                            className="p-2 text-neutral-500 hover:text-neutral-900 disabled:opacity-25 disabled:cursor-not-allowed"
                                          >
                                            <ArrowUp className="w-4 h-4" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => moveItem(area.id, item.id, 'down')}
                                            disabled={itemIndex === area.items.length - 1}
                                            aria-label="Move reporting item down"
                                            title="Move reporting item down"
                                            className="p-2 text-neutral-500 hover:text-neutral-900 disabled:opacity-25 disabled:cursor-not-allowed"
                                          >
                                            <ArrowDown className="w-4 h-4" />
                                          </button>
                                        </>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => deleteItem(area.id, item.id)}
                                        aria-label="Delete reporting item"
                                        title="Delete reporting item"
                                        className="p-2 text-neutral-300 hover:text-red-600"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">
                                      {isDaily ? 'Brief Summary of Activities Today' : 'Brief Summary of Activities within this period'}
                                    </label>
                                    <textarea
                                      value={item.agentComments}
                                      onChange={(event) => updateItem(area.id, item.id, { agentComments: event.target.value })}
                                      rows={4}
                                      className="w-full border border-neutral-300 rounded-lg p-2 text-xs"
                                      placeholder="Describe the attendance, activity, observation or work completed..."
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">Actions</label>
                                    <textarea
                                      value={item.actionComments || ''}
                                      onChange={(event) => updateItem(area.id, item.id, { actionComments: event.target.value })}
                                      rows={4}
                                      className="w-full border border-neutral-300 rounded-lg p-2 text-xs"
                                      placeholder="Record action taken, follow-up, status or next step..."
                                    />
                                  </div>
                                </div>
                              </>
                            )}

                            <ItemWorkflowControls
                              area={area}
                              item={item}
                              photos={photos}
                              maintenanceEnabled={maintenanceEnabled}
                              showActionTracking={false}
                              showGeneralPhotoControls={false}
                              onChangeItem={(patch) => updateItem(area.id, item.id, patch)}
                              onUploadPhotos={onUploadPhotos}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'details' && (
          <div className="space-y-4 text-xs">
            <div className="border-b border-neutral-200 pb-2">
              <h3 className="font-bold text-neutral-900 text-sm">{template.summaryTitle}</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {detailFields.map(([key, label, placeholder]) => (
                <div key={String(key)} className={key === 'propertyAddress' ? 'md:col-span-2' : ''}>
                  <label className="block font-semibold text-neutral-700 mb-1">{label}</label>
                  <input
                    value={typeof details[key] === 'string' ? String(details[key]) : ''}
                    onChange={(event) => updateDetail(key, event.target.value)}
                    className="w-full border border-neutral-300 rounded-lg p-2"
                    placeholder={placeholder}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'summary' && (
          <div className="space-y-4 text-xs">
            <h3 className="font-bold text-neutral-900 text-sm pb-2 border-b border-neutral-200">{template.finalSectionTitle}</h3>

            {summaryFields.map(([key, label, rows]) => (
              <div key={String(key)}>
                <label className="block font-semibold text-neutral-700 mb-1">{label}</label>
                <textarea
                  value={typeof details[key] === 'string' ? String(details[key]) : ''}
                  onChange={(event) => updateDetail(key, event.target.value)}
                  rows={rows}
                  className="w-full border border-neutral-300 rounded-lg p-2 bg-white"
                />
              </div>
            ))}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Prepared / Signed By</label>
                <input
                  value={details.agentSignName || ''}
                  onChange={(event) => updateDetail('agentSignName', event.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Sign-off Date</label>
                <input
                  value={details.agentSignDate || ''}
                  onChange={(event) => updateDetail('agentSignDate', event.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2"
                  placeholder="DD/MM/YYYY"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Report Disclaimer</label>
              <textarea
                value={details.disclaimerText}
                onChange={(event) => updateDetail('disclaimerText', event.target.value)}
                rows={5}
                className="w-full border border-neutral-300 rounded-lg p-2 bg-neutral-50 text-[11px]"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CloudDownload, Image, Upload, Trash2, Tag, Filter, Plus, Star } from 'lucide-react';
import { normalizeAreaName, renumberPhotosByArea } from '../lib/reportFormatting';
import { REPORT_IMAGE_ACCEPT, imageFilesFromList } from '../lib/photoDrop';
import { pickGoogleDriveImages } from '../lib/googleDrive';
import { InspectionArea, ReportPhoto } from '../types/report';

interface PhotoManagerProps {
  photos: ReportPhoto[];
  areas?: InspectionArea[];
  coverPhotoUrl?: string;
  isUploading?: boolean;
  pendingUploadCount?: number;
  onUploadPhotos: (files: File[], areaName: string, itemId?: string, areaId?: string) => Promise<void>;
  onUploadCoverPhoto: (file: File) => Promise<void>;
  onUpdatePhotos: (photos: ReportPhoto[]) => void;
  linkToItems?: boolean;
  requireItemLink?: boolean;
  showCoverPhoto?: boolean;
  itemSelectorPlaceholder?: string;
  onDeletePhoto: (id: string) => Promise<void>;
}

export const PhotoManager: React.FC<PhotoManagerProps> = ({
  photos,
  areas = [],
  coverPhotoUrl,
  isUploading = false,
  pendingUploadCount = 0,
  onUploadPhotos,
  onUploadCoverPhoto,
  onUpdatePhotos,
  onDeletePhoto,
  linkToItems = false,
  requireItemLink = false,
  showCoverPhoto = true,
  itemSelectorPlaceholder = 'Select reporting item',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const areaFileInputRef = useRef<HTMLInputElement>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const [selectedUploadArea, setSelectedUploadArea] = useState<string>(areas[0]?.name || 'General');
  const [targetUploadArea, setTargetUploadArea] = useState<string>(areas[0]?.name || 'General');
  const [activeAreaFilter, setActiveAreaFilter] = useState<string>('ALL');
  const [bulkMoveArea, setBulkMoveArea] = useState<string>(areas[0]?.name || '');
  const [selectedUploadItemId, setSelectedUploadItemId] = useState<string>('');
  const [targetUploadItemId, setTargetUploadItemId] = useState<string>('');
  const [visiblePhotoCount, setVisiblePhotoCount] = useState(60);
  const [isDriveImporting, setIsDriveImporting] = useState(false);

  const reportAreaNames = useMemo(
    () => Array.from(new Set(areas.map((area) => area.name.trim()).filter(Boolean))),
    [areas]
  );
  const availableAreaNames = reportAreaNames.length ? reportAreaNames : ['General'];
  const validAreaKeys = useMemo(
    () => new Set(reportAreaNames.map((name) => normalizeAreaName(name))),
    [reportAreaNames]
  );
  const existingAreaNames = useMemo(
    () => Array.from(new Set(photos.map((photo) => (photo.areaName || 'General').trim() || 'General'))),
    [photos]
  );
  const unmappedAreaNames = existingAreaNames.filter(
    (name) => reportAreaNames.length > 0 && !validAreaKeys.has(normalizeAreaName(name))
  );
  const areaByName = useMemo(
    () => new Map(areas.map((area) => [area.name, area])),
    [areas]
  );
  const selectedAreaItems = areaByName.get(selectedUploadArea)?.items || [];
  const targetAreaItems = areaByName.get(targetUploadArea)?.items || [];

  const validItemIds = useMemo(() => {
    const ids = new Set<string>();
    areas.forEach((area) => area.items.forEach((item) => ids.add(item.id)));
    return ids;
  }, [areas]);

  useEffect(() => {
    const fallback = availableAreaNames[0] || 'General';
    if (!availableAreaNames.includes(selectedUploadArea)) setSelectedUploadArea(fallback);
    if (!availableAreaNames.includes(targetUploadArea)) setTargetUploadArea(fallback);
    if (!availableAreaNames.includes(bulkMoveArea)) setBulkMoveArea(fallback);

    if (linkToItems) {
      const selectedItems = areaByName.get(selectedUploadArea)?.items || [];
      if (selectedUploadItemId && !selectedItems.some((item) => item.id === selectedUploadItemId)) {
        setSelectedUploadItemId('');
      }
      const targetItems = areaByName.get(targetUploadArea)?.items || [];
      if (targetUploadItemId && !targetItems.some((item) => item.id === targetUploadItemId)) {
        setTargetUploadItemId('');
      }
    }
  }, [
    availableAreaNames,
    selectedUploadArea,
    targetUploadArea,
    bulkMoveArea,
    linkToItems,
    areaByName,
    selectedUploadItemId,
    targetUploadItemId,
  ]);

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    areaName: string,
    itemId?: string
  ) => {
    const files = imageFilesFromList(event.target.files);
    event.target.value = '';
    if (!files.length) return;
    if (requireItemLink && !itemId) {
      alert(`Select a ${itemSelectorPlaceholder.toLowerCase()} before uploading photos.`);
      return;
    }
    const areaId = areaByName.get(areaName)?.id;
    await onUploadPhotos(files, areaName || 'General', itemId || undefined, areaId);
  };

  const handleDriveImport = async () => {
    if (requireItemLink && !selectedUploadItemId) {
      alert(`Select a ${itemSelectorPlaceholder.toLowerCase()} before importing photos.`);
      return;
    }
    setIsDriveImporting(true);
    try {
      const files = await pickGoogleDriveImages();
      if (!files.length) return;
      const area = areaByName.get(selectedUploadArea);
      await onUploadPhotos(files, selectedUploadArea || 'General', selectedUploadItemId || undefined, area?.id);
    } catch (error: any) {
      alert(error.message || 'Unable to import photos from Google Drive.');
    } finally {
      setIsDriveImporting(false);
    }
  };

  const handleCoverFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await onUploadCoverPhoto(file);
  };

  const handleUploadForSpecificArea = (areaName: string) => {
    setTargetUploadArea(areaName);
    const items = areaByName.get(areaName)?.items || [];
    if (linkToItems) {
      setTargetUploadItemId('');
    }
    areaFileInputRef.current?.click();
  };

  const handleRenamePhoto = (id: string, name: string) => {
    onUpdatePhotos(photos.map((photo) => photo.id === id ? { ...photo, name } : photo));
  };

  const handleReassignPhotoArea = (id: string, areaName: string) => {
    const firstItem = areaByName.get(areaName)?.items[0];
    const updated = photos.map((photo) => {
      if (photo.id !== id) return photo;
      return {
        ...photo,
        areaName,
        itemId: linkToItems ? firstItem?.id : photo.itemId,
        itemName: linkToItems ? firstItem?.name : photo.itemName,
      };
    });
    onUpdatePhotos(renumberPhotosByArea(updated));
  };

  const handleReassignPhotoItem = (id: string, itemId: string) => {
    const photo = photos.find((item) => item.id === id);
    const area = areaByName.get(photo?.areaName || '');
    const item = area?.items.find((candidate) => candidate.id === itemId);
    onUpdatePhotos(
      photos.map((candidate) =>
        candidate.id === id
          ? { ...candidate, itemId: item?.id, itemName: item?.name || '' }
          : candidate
      )
    );
  };

  const handleBulkMove = () => {
    if (!bulkMoveArea || activeAreaFilter === 'ALL') return;
    const updated = photos.map((photo) => {
      const currentArea = (photo.areaName || 'General').trim() || 'General';
      return currentArea === activeAreaFilter ? { ...photo, areaName: bulkMoveArea } : photo;
    });
    onUpdatePhotos(renumberPhotosByArea(updated));
    setActiveAreaFilter(bulkMoveArea);
  };

  const areaCounts: Record<string, number> = {};
  photos.forEach((photo) => {
    const key = (photo.areaName || 'General').trim() || 'General';
    areaCounts[key] = (areaCounts[key] || 0) + 1;
  });

  const areasWithoutPhotos = reportAreaNames.filter((name) => !areaCounts[name]);
  const unmappedPhotoCount = photos.filter((photo) => {
    if (!reportAreaNames.length) return false;
    return !validAreaKeys.has(normalizeAreaName(photo.areaName || 'General'));
  }).length;
  const unlinkedItemPhotoCount = linkToItems
    ? photos.filter((photo) =>
        requireItemLink
          ? !photo.itemId || !validItemIds.has(photo.itemId)
          : Boolean(photo.itemId && !validItemIds.has(photo.itemId))
      ).length
    : 0;

  const filteredPhotos = activeAreaFilter === 'ALL'
    ? photos
    : photos.filter((photo) => (photo.areaName || 'General') === activeAreaFilter);

  useEffect(() => {
    setVisiblePhotoCount(60);
  }, [activeAreaFilter]);

  const visiblePhotos = filteredPhotos.slice(0, visiblePhotoCount);

  return (
    <div className="bg-white rounded-xl shadow-xs border border-neutral-200 overflow-hidden flex flex-col h-full">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={REPORT_IMAGE_ACCEPT}
        onChange={(event) => handleFileUpload(event, selectedUploadArea, selectedUploadItemId)}
        className="hidden"
      />
      <input
        ref={areaFileInputRef}
        type="file"
        multiple
        accept={REPORT_IMAGE_ACCEPT}
        onChange={(event) => handleFileUpload(event, targetUploadArea, targetUploadItemId)}
        className="hidden"
      />
      <input
        ref={coverFileInputRef}
        type="file"
        accept={REPORT_IMAGE_ACCEPT}
        onChange={handleCoverFileUpload}
        className="hidden"
      />

      {showCoverPhoto && (
        <div className="p-4 border-b border-neutral-200 bg-white">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-full sm:w-40 aspect-[4/3] rounded-lg border border-neutral-200 bg-neutral-50 overflow-hidden flex items-center justify-center shrink-0">
              {coverPhotoUrl ? (
                <img src={coverPhotoUrl} alt="Report cover" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center text-neutral-400 text-xs px-3">
                  <Star className="w-5 h-5 mx-auto mb-1.5" />
                  No dedicated cover photo
                </div>
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm font-bold text-neutral-900">
                <Star className="w-4 h-4 text-amber-500" />
                Report Cover Photo
              </div>
              <p className="text-xs text-neutral-500 mt-1 max-w-2xl">
                Upload a dedicated cover image for the first page of the report. This image is stored separately from inspection evidence and does not need an area or reporting-item assignment.
              </p>
              <button
                type="button"
                onClick={() => coverFileInputRef.current?.click()}
                className="mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                {coverPhotoUrl ? 'Queue Replacement Cover' : 'Queue Cover Photo'}
              </button>
            </div>
          </div>
        </div>
  
      )}

      {(pendingUploadCount > 0 || isUploading) && (
        <div className="px-4 py-2.5 bg-cyan-50 border-b border-cyan-200 text-cyan-900 text-xs flex items-center justify-between gap-3">
          <span><strong>{pendingUploadCount}</strong> photo{pendingUploadCount === 1 ? '' : 's'} queued/uploading in the background.</span>
          <span className="text-cyan-700">You can continue editing and queue more photos.</span>
        </div>
      )}

      <div className="p-4 border-b border-neutral-200 bg-neutral-50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-neutral-900 text-sm flex items-center gap-2">
            <Image className="w-4 h-4 text-neutral-700" />
            {linkToItems ? 'Item-linked Photo Evidence' : 'Property Inspection Photos'} ({photos.length})
          </h3>
          <p className="text-xs text-neutral-500">
            {linkToItems
              ? requireItemLink
                ? `Every photo must be linked to a specific ${itemSelectorPlaceholder.toLowerCase()}. Uploads continue in the background while you keep working.`
                : 'Queue photos to a whole category or a specific reporting item. Uploads continue in the background while you keep working.'
              : 'Upload JPG, PNG, WebP, HEIC or HEIF photos. HEIC/HEIF images are converted to JPEG before upload. Uploads continue in the background.'}
            {linkToItems && <span className="block mt-1">Supported: JPG, PNG, WebP, HEIC and HEIF. Apple photos are converted on this device.</span>}
          </p>
        </div>

        <div className="flex items-center rounded-lg border border-neutral-300 bg-white overflow-hidden text-xs shadow-2xs">
          <span className="px-2.5 py-1.5 bg-neutral-100 text-neutral-600 font-semibold border-r border-neutral-300 flex items-center gap-1">
            <Tag className="w-3 h-3" /> Area
          </span>
          <select
            value={selectedUploadArea}
            onChange={(event) => {
              const areaName = event.target.value;
              setSelectedUploadArea(areaName);
              if (linkToItems) {
                setSelectedUploadItemId('');
              }
            }}
            className="px-2 py-1.5 bg-transparent font-medium text-neutral-800 focus:outline-hidden"
          >
            {availableAreaNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          {linkToItems && (
            <select
              value={selectedUploadItemId}
              onChange={(event) => setSelectedUploadItemId(event.target.value)}
              className="px-2 py-1.5 bg-transparent font-medium text-neutral-800 focus:outline-hidden border-l border-neutral-300 max-w-56"
              disabled={!selectedAreaItems.length}
              title="Reporting item"
            >
              <option value="">{requireItemLink ? itemSelectorPlaceholder : 'Category-level photos'}</option>
              {selectedAreaItems.map((item) => (
                <option key={item.id} value={item.id}>{item.name || 'Untitled reporting item'}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={handleDriveImport}
            disabled={isDriveImporting || (requireItemLink && !selectedUploadItemId)}
            className="px-3 py-1.5 border-l border-neutral-300 bg-white text-neutral-800 font-bold flex items-center gap-1.5 disabled:opacity-50"
            title="Import multiple images from Google Drive"
          >
            <CloudDownload className="w-3.5 h-3.5" />
            {isDriveImporting ? 'Opening Drive...' : 'Google Drive'}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={requireItemLink && !selectedUploadItemId}
            className="px-3 py-1.5 bg-[#0a2540] text-white font-bold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Upload className="w-3.5 h-3.5" />
            Queue Photos
          </button>
        </div>
      </div>

      <div className="px-4 py-2.5 bg-white border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-full">
          <span className="text-neutral-500 font-medium flex items-center gap-1 mr-1 shrink-0">
            <Filter className="w-3.5 h-3.5" /> Filter
          </span>
          <button
            onClick={() => setActiveAreaFilter('ALL')}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${
              activeAreaFilter === 'ALL' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            All ({photos.length})
          </button>

          {areas.map((area) => {
            const count = areaCounts[area.name] || 0;
            return (
              <button
                key={area.id}
                onClick={() => setActiveAreaFilter(area.name)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 border ${
                  activeAreaFilter === area.name
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : count
                    ? 'bg-blue-50 border-blue-200 text-blue-800'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}
                title={count ? undefined : 'No photos are currently assigned to this report area'}
              >
                {area.name} ({count})
              </button>
            );
          })}
          {unmappedAreaNames.map((name) => (
            <button
              key={`unmapped-${name}`}
              onClick={() => setActiveAreaFilter(name)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 border ${
                activeAreaFilter === name
                  ? 'bg-red-600 border-red-600 text-white'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
              title="This photo area does not match a report commentary area"
            >
              {name} ({areaCounts[name] || 0}) - review
            </button>
          ))}
        </div>

        {activeAreaFilter !== 'ALL' && (
          <div className="flex flex-wrap items-center gap-2">
            {!requireItemLink && validAreaKeys.has(normalizeAreaName(activeAreaFilter)) && (
              <button
                onClick={() => handleUploadForSpecificArea(activeAreaFilter)}
                
                className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg font-semibold flex items-center gap-1 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" /> Add to {activeAreaFilter}
              </button>
            )}
            {!linkToItems && reportAreaNames.length > 0 && (
              <div className="flex items-center rounded-lg border border-neutral-300 overflow-hidden bg-white">
                <select
                  value={bulkMoveArea}
                  onChange={(event) => setBulkMoveArea(event.target.value)}
                  className="px-2 py-1 bg-white text-neutral-700 focus:outline-hidden"
                >
                  {reportAreaNames.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                <button
                  onClick={handleBulkMove}
                  disabled={!bulkMoveArea || bulkMoveArea === activeAreaFilter}
                  className="px-2.5 py-1 border-l border-neutral-300 font-semibold text-neutral-700 disabled:opacity-40"
                  title="Move every photo currently shown by this area filter"
                >
                  Move all shown
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {(unmappedPhotoCount > 0 || unlinkedItemPhotoCount > 0 || areasWithoutPhotos.length > 0) && (
        <div className="px-4 py-3 border-b border-amber-200 bg-amber-50 text-amber-900 text-xs">
          <div className="font-bold">Photo area review recommended before finalising</div>
          {unmappedPhotoCount > 0 && (
            <div className="mt-1">
              {unmappedPhotoCount} photo{unmappedPhotoCount === 1 ? '' : 's'} are not assigned to a current report area. Use the red filter above and move them to the correct area.
            </div>
          )}
          {unlinkedItemPhotoCount > 0 && (
            <div className="mt-1">
              {unlinkedItemPhotoCount} photo{unlinkedItemPhotoCount === 1 ? '' : 's'} {requireItemLink ? 'must be linked to a current reporting item before finalising.' : 'reference a reporting item that no longer exists. Reassign them to the correct reporting item or leave them as category-level evidence.'}
            </div>
          )}
          {areasWithoutPhotos.length > 0 && (
            <div className="mt-1">
              No photos are currently assigned to: {areasWithoutPhotos.join(', ')}. Confirm this is intentional or reassign the relevant photos.
            </div>
          )}
        </div>
      )}

      <div className="p-4 overflow-y-auto flex-1 bg-neutral-50/50">
        {filteredPhotos.length === 0 ? (
          <div className="h-64 border-2 border-dashed border-neutral-300 rounded-xl flex flex-col items-center justify-center text-center p-6 bg-white">
            <Upload className="w-8 h-8 text-neutral-400 mb-3" />
            <h4 className="font-bold text-neutral-800 text-sm">No photos uploaded</h4>
            <p className="text-xs text-neutral-500 max-w-sm mt-1 mb-4">
              {requireItemLink
                ? `Select a ${itemSelectorPlaceholder.toLowerCase()} above, then upload photos. They will be compressed in the browser and linked to that item.`
                : 'Upload inspection photos from this device. They will be compressed in the browser and stored with this report.'}
            </p>
            <button
              onClick={() => requireItemLink ? fileInputRef.current?.click() : handleUploadForSpecificArea(activeAreaFilter === 'ALL' ? selectedUploadArea : activeAreaFilter)}
              disabled={requireItemLink && !selectedUploadItemId}
              className="px-4 py-2 bg-[#0a2540] text-white rounded-lg text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Upload Photos
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
            {visiblePhotos.map((photo, index) => (
              <div key={photo.id} className="group border border-neutral-200 rounded-lg overflow-hidden bg-white shadow-xs">
                <div className="relative aspect-4/3 bg-neutral-100 overflow-hidden">
                  {photo.dataUrl || photo.url ? (
                    <img
                      src={photo.dataUrl || photo.url}
                      alt={photo.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-neutral-400">
                      Image unavailable
                    </div>
                  )}
                  <div className="absolute top-1.5 left-1.5 bg-black/75 text-white text-[10px] px-1.5 py-0.5 rounded font-mono font-bold">
                    #{photo.photoIndex || index + 1}
                  </div>
                  <div className="absolute top-1.5 right-1.5 flex gap-1">
                    <button
                      onClick={() => onDeletePhoto(photo.id)}
                      className="bg-red-600 text-white p-1 rounded shadow-xs opacity-0 group-hover:opacity-100"
                      title="Delete photo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="p-2.5 bg-white flex flex-col gap-1.5">
                  <select
                    value={photo.areaName || 'General'}
                    onChange={(event) => handleReassignPhotoArea(photo.id, event.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded px-1.5 py-1 font-bold text-neutral-800 text-[10px]"
                  >
                    {!availableAreaNames.includes((photo.areaName || 'General').trim() || 'General') && (
                      <option value={(photo.areaName || 'General').trim() || 'General'}>
                        {(photo.areaName || 'General').trim() || 'General'} (unmapped)
                      </option>
                    )}
                    {availableAreaNames.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                  {linkToItems && (
                    <select
                      value={photo.itemId || ''}
                      onChange={(event) => handleReassignPhotoItem(photo.id, event.target.value)}
                      className="w-full bg-cyan-50 border border-cyan-200 rounded px-1.5 py-1 font-semibold text-cyan-900 text-[10px]"
                    >
                      <option value="" disabled={requireItemLink}>
                        {requireItemLink ? itemSelectorPlaceholder : 'Category-level photo'}
                      </option>
                      {(areaByName.get(photo.areaName || '')?.items || []).map((item) => (
                        <option key={item.id} value={item.id}>{item.name || 'Untitled reporting item'}</option>
                      ))}
                    </select>
                  )}
                  <input
                    value={photo.name}
                    onChange={(event) => handleRenamePhoto(photo.id, event.target.value)}
                    className="text-[11px] text-neutral-800 border border-neutral-200 rounded px-1.5 py-1"
                    placeholder="Photo caption"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        {filteredPhotos.length > visiblePhotos.length && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => setVisiblePhotoCount((count) => count + 60)}
              className="px-4 py-2 rounded-lg border border-neutral-300 bg-white text-xs font-semibold text-neutral-700"
            >
              Load 60 more photos ({filteredPhotos.length - visiblePhotos.length} remaining)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

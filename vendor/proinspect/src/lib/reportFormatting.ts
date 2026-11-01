import { ReportPhoto } from '../types/report';

export function formatAustralianDate(input?: string | null): string {
  const raw = (input || '').trim();
  if (!raw) return '';

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }

  const australianMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (australianMatch) {
    return `${australianMatch[1].padStart(2, '0')}/${australianMatch[2].padStart(2, '0')}/${australianMatch[3]}`;
  }

  return raw;
}

export function splitTenantNames(input?: string | null, maxTenants = 3): string[] {
  const raw = (input || '').trim();
  if (!raw) return [];

  const names = raw
    .split(/\s*(?:;|&|\band\b|\r?\n|,)\s*/i)
    .map((name) => name.trim())
    .filter(Boolean);

  return names.slice(0, maxTenants);
}

export function normalizeAreaName(input?: string | null): string {
  return (input || '').trim().toLowerCase();
}

export function renumberPhotosByArea(photos: ReportPhoto[]): ReportPhoto[] {
  const nextIndex = new Map<string, number>();

  return photos.map((photo) => {
    const key = normalizeAreaName(photo.areaName) || 'general';
    const photoIndex = (nextIndex.get(key) || 0) + 1;
    nextIndex.set(key, photoIndex);

    const areaName = (photo.areaName || 'General').trim() || 'General';
    const currentName = (photo.name || '').trim();
    const descriptiveSuffix = currentName.includes(':')
      ? currentName.split(':').slice(1).join(':').trim()
      : currentName;
    const generatedPattern = /^(?:overall|.+?)\s*\(photo\s+\d+(?:\s+of\s+\d+)?\)$/i;
    const itemLabel = (photo.itemName || '').trim();
    const suffix = itemLabel
      ? `${itemLabel} (photo ${photoIndex})`
      : !descriptiveSuffix || generatedPattern.test(descriptiveSuffix)
      ? `Overall (photo ${photoIndex})`
      : descriptiveSuffix;

    return {
      ...photo,
      areaName,
      photoIndex,
      name: `${areaName}: ${suffix}`,
    };
  });
}

import { normalizeAreaName } from './reportFormatting';
import type { ReportData, ReportPhoto } from '../types/report';

export interface CustomReportContentBlock {
  areaName: string;
  itemName: string;
  commentary: string;
  photos: ReportPhoto[];
  continuation: boolean;
}

const TEXT_CHUNK_LIMIT = 900;
const PHOTO_CHUNK_LIMIT = 6;
const PAGE_HEIGHT_BUDGET_MM = 215;

function splitCommentary(text: string): string[] {
  const remaining = (text || 'No commentary recorded.').trim() || 'No commentary recorded.';
  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < remaining.length) {
    let end = Math.min(cursor + TEXT_CHUNK_LIMIT, remaining.length);
    if (end < remaining.length) {
      const boundary = Math.max(
        remaining.lastIndexOf('\n', end),
        remaining.lastIndexOf(' ', end)
      );
      if (boundary > cursor + Math.floor(TEXT_CHUNK_LIMIT / 2)) end = boundary + 1;
    }
    chunks.push(remaining.slice(cursor, end).trim());
    cursor = end;
  }
  return chunks.length ? chunks : ['No commentary recorded.'];
}

function blockHeight(block: CustomReportContentBlock): number {
  const textLines = block.commentary
    ? block.commentary.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length / 90)), 0)
    : 0;
  return 23 + textLines * 3.2 + Math.ceil(block.photos.length / 3) * 49;
}

export function buildCustomReportPreviewPages(report: ReportData): CustomReportContentBlock[][] {
  const blocks: CustomReportContentBlock[] = [];

  for (const area of report.areas) {
    for (const item of area.items) {
      const commentaryChunks = splitCommentary(item.agentComments);
      const linkedPhotos = report.photos
        .filter((photo) => photo.itemId === item.id)
        .sort((a, b) => (a.photoIndex || 0) - (b.photoIndex || 0));
      const fragmentCount = Math.max(
        commentaryChunks.length,
        Math.ceil(linkedPhotos.length / PHOTO_CHUNK_LIMIT),
        1
      );

      for (let fragment = 0; fragment < fragmentCount; fragment += 1) {
        blocks.push({
          areaName: area.name,
          itemName: item.name || 'Untitled item',
          commentary: commentaryChunks[fragment] || '',
          photos: linkedPhotos.slice(fragment * PHOTO_CHUNK_LIMIT, (fragment + 1) * PHOTO_CHUNK_LIMIT),
          continuation: fragment > 0,
        });
      }
    }

    const unlinkedPhotos = report.photos
      .filter((photo) => !photo.itemId && normalizeAreaName(photo.areaName) === normalizeAreaName(area.name))
      .sort((a, b) => (a.photoIndex || 0) - (b.photoIndex || 0));
    for (let start = 0; start < unlinkedPhotos.length; start += PHOTO_CHUNK_LIMIT) {
      blocks.push({
        areaName: area.name,
        itemName: 'Section Photo Evidence',
        commentary: '',
        photos: unlinkedPhotos.slice(start, start + PHOTO_CHUNK_LIMIT),
        continuation: start > 0,
      });
    }

    if (!area.items.length && !unlinkedPhotos.length) {
      blocks.push({
        areaName: area.name,
        itemName: 'No items recorded',
        commentary: '',
        photos: [],
        continuation: false,
      });
    }
  }

  const pages: CustomReportContentBlock[][] = [];
  let currentPage: CustomReportContentBlock[] = [];
  let usedHeight = 0;
  for (const block of blocks) {
    const height = blockHeight(block);
    if (currentPage.length && usedHeight + height > PAGE_HEIGHT_BUDGET_MM) {
      pages.push(currentPage);
      currentPage = [];
      usedHeight = 0;
    }
    currentPage.push(block);
    usedHeight += height;
  }
  if (currentPage.length) pages.push(currentPage);
  return pages;
}

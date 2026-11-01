import { ReportData } from '../types/report';

const DB_NAME = 'proinspect-report-cache-v1';
const DB_VERSION = 1;
const REPORT_STORE = 'reports';
const MAX_CACHED_REPORTS = 40;

function lightweightCachedReport(report: ReportData): ReportData {
  return {
    ...report,
    details: {
      ...report.details,
      coverPhotoUrl: report.details.coverPhotoUrl?.startsWith('data:')
        ? undefined
        : report.details.coverPhotoUrl,
    },
    photos: (report.photos || []).map((photo) => ({
      ...photo,
      dataUrl: undefined,
    })),
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(REPORT_STORE)) {
        db.createObjectStore(REPORT_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheReport(report: ReportData): Promise<void> {
  if (!report.id) return;
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(REPORT_STORE, 'readwrite');
    tx.objectStore(REPORT_STORE).put(lightweightCachedReport(report));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await pruneCachedReports(db).catch(() => undefined);
  db.close();
}

async function pruneCachedReports(db: IDBDatabase): Promise<void> {
  const reports = await new Promise<ReportData[]>((resolve, reject) => {
    const request = db.transaction(REPORT_STORE, 'readonly').objectStore(REPORT_STORE).getAll();
    request.onsuccess = () => resolve((request.result || []) as ReportData[]);
    request.onerror = () => reject(request.error);
  });
  if (reports.length <= MAX_CACHED_REPORTS) return;

  const staleIds = reports
    .sort((a, b) => Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || ''))
    .slice(MAX_CACHED_REPORTS)
    .map((report) => report.id)
    .filter((id): id is string => Boolean(id));

  if (!staleIds.length) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(REPORT_STORE, 'readwrite');
    const store = tx.objectStore(REPORT_STORE);
    staleIds.forEach((id) => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedReport(id: string): Promise<ReportData | null> {
  const db = await openDatabase();
  const value = await new Promise<ReportData | undefined>((resolve, reject) => {
    const request = db.transaction(REPORT_STORE, 'readonly').objectStore(REPORT_STORE).get(id);
    request.onsuccess = () => resolve(request.result as ReportData | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value || null;
}

export async function removeCachedReport(id: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(REPORT_STORE, 'readwrite');
    tx.objectStore(REPORT_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

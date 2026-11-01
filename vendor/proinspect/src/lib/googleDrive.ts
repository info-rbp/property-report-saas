import { isReportImageFile } from './photoDrop';

const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

declare global {
  interface Window {
    google?: any;
    gapi?: any;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Unable to load ${src}`));
    document.head.appendChild(script);
  });
}

async function ensureGoogleLibraries(): Promise<void> {
  await Promise.all([
    loadScript('https://accounts.google.com/gsi/client'),
    loadScript('https://apis.google.com/js/api.js'),
  ]);

  await new Promise<void>((resolve, reject) => {
    if (!window.gapi?.load) {
      reject(new Error('Google API loader did not initialise.'));
      return;
    }
    window.gapi.load('picker', {
      callback: () => resolve(),
      onerror: () => reject(new Error('Google Picker did not initialise.')),
      timeout: 10000,
      ontimeout: () => reject(new Error('Google Picker timed out while initialising.')),
    });
  });

  if (!window.google?.accounts?.oauth2 || !window.google?.picker) {
    throw new Error('Google Drive libraries did not initialise.');
  }
}

async function requestAccessToken(clientId: string): Promise<string> {
  await ensureGoogleLibraries();
  return new Promise<string>((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SCOPE,
      callback: (response: any) => {
        if (response?.error || !response?.access_token) {
          reject(new Error(response?.error_description || response?.error || 'Google Drive authorisation failed.'));
          return;
        }
        resolve(response.access_token);
      },
      error_callback: () => reject(new Error('Google Drive authorisation was cancelled.')),
    });
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

async function chooseDriveFiles(apiKey: string, token: string): Promise<Array<{ id: string; name: string; mimeType: string }>> {
  return new Promise((resolve) => {
    const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS_IMAGES)
      .setIncludeFolders(false)
      .setSelectFolderEnabled(false);

    const picker = new window.google.picker.PickerBuilder()
      .setDeveloperKey(apiKey)
      .setOAuthToken(token)
      .addView(view)
      .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
      .setTitle('Select report photos from Google Drive')
      .setCallback((data: any) => {
        if (data.action === window.google.picker.Action.PICKED) {
          resolve(
            (data.docs || []).map((doc: any) => ({
              id: String(doc.id),
              name: String(doc.name || 'Google Drive image'),
              mimeType: String(doc.mimeType || doc.type || 'image/jpeg'),
            }))
          );
        } else if (data.action === window.google.picker.Action.CANCEL) {
          resolve([]);
        }
      })
      .build();
    picker.setVisible(true);
  });
}

async function downloadDriveFile(
  token: string,
  item: { id: string; name: string; mimeType: string },
): Promise<File> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.id)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok) throw new Error(`Unable to download ${item.name} from Google Drive (${response.status}).`);
  const blob = await response.blob();
  return new File([blob], item.name, { type: blob.type || item.mimeType || 'image/jpeg' });
}

export async function pickGoogleDriveImages(): Promise<File[]> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;
  if (!clientId || !apiKey) {
    throw new Error('Google Drive import is not configured. Set VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY for this deployment.');
  }

  const token = await requestAccessToken(clientId);
  const selected = await chooseDriveFiles(apiKey, token);
  const files: File[] = [];
  for (const item of selected) {
    const file = await downloadDriveFile(token, item);
    if (isReportImageFile(file)) files.push(file);
  }
  return files;
}

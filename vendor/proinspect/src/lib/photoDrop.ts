/**
 * Accepted by the report photo pickers. HEIC/HEIF files are converted to JPEG
 * client-side before being uploaded to R2 or included in an offline photo queue.
 * Filename extensions are important because desktop browsers sometimes omit
 * the MIME type for Apple HEIC files.
 */
export const REPORT_IMAGE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,image/x-heic,image/x-heif,.heic,.heif,.heics,.heifs';

const HEIC_MIME = /^image\/(?:x-)?hei(?:c|f)(?:-sequence)?$/i;
const HEIC_EXTENSION = /\.(?:heic|heif|heics|heifs)$/i;
const KNOWN_IMAGE_EXTENSION = /\.(?:jpe?g|png|webp|gif|avif|bmp|heic|heif|heics|heifs)$/i;

export function isHeicImageFile(file: Pick<File, 'name' | 'type'>): boolean {
  return HEIC_MIME.test(file.type.trim()) || HEIC_EXTENSION.test(file.name);
}

/**
 * Files selected by the native picker, Google Drive or drag and drop.
 * A missing MIME type is common for HEIC and some desktop file managers.
 */
export function isReportImageFile(file: Pick<File, 'name' | 'type'>): boolean {
  const mimeType = file.type.trim().toLowerCase();
  return isHeicImageFile(file) ||
    mimeType.startsWith('image/') ||
    (!mimeType && KNOWN_IMAGE_EXTENSION.test(file.name));
}

export function imageFilesFromList(files: FileList | ArrayLike<File> | null): File[] {
  if (!files) return [];
  return Array.from(files).filter(isReportImageFile);
}

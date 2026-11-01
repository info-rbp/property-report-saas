import { isHeicImageFile, isReportImageFile } from './photoDrop';

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * The application stores report/cover/evidence photos as JPEG, including
 * originals received as HEIC or HEIF. Decode Apple photos locally, on demand,
 * using the CSP-safe build (the site's CSP does not allow unsafe-eval).
 */
async function jpegSourceForImage(file: File): Promise<Blob> {
  if (!isHeicImageFile(file)) return file;

  try {
    // Load the larger HEIC decoder only when a HEIC/HEIF file is selected.
    const { heicTo } = await import('heic-to/csp');
    const jpeg = await heicTo({
      blob: file,
      type: 'image/jpeg',
      quality: 0.92,
    });
    if (!(jpeg instanceof Blob) || jpeg.size === 0 || jpeg.type !== 'image/jpeg') {
      throw new Error('The image decoder did not return JPEG data.');
    }
    return jpeg;
  } catch {
    throw new Error(
      `${file.name} could not be converted from HEIC/HEIF. The file may be damaged or use an unsupported codec. Export it as JPG or PNG and try again.`
    );
  }
}

export async function processInspectionImage(
  file: File,
  maxDimension = 1600,
  quality = 0.8
): Promise<ProcessedImage> {
  if (!isReportImageFile(file)) {
    throw new Error(`${file.name} is not a supported image file. Use JPG, PNG, WebP, HEIC or HEIF.`);
  }

  const source = await jpegSourceForImage(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    throw new Error(
      `${file.name} could not be read by this browser. Use JPG, PNG, WebP or a valid HEIC/HEIF image.`
    );
  }

  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');

  try {
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('Unable to prepare image for upload.');
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error('Unable to compress image.')),
        'image/jpeg',
        quality
      );
    });

    if (blob.type !== 'image/jpeg' || blob.size === 0) {
      throw new Error('The browser could not prepare a JPEG image for upload.');
    }
    return { blob, width, height };
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}

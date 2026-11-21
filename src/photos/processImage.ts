export const FULL_MAX_EDGE = 1600;
export const THUMB_MAX_EDGE = 360;
const FULL_QUALITY = 0.82;
const THUMB_QUALITY = 0.72;

export interface ProcessedImage {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

export type ImageProcessor = (file: Blob) => Promise<ProcessedImage>;

/** Scales (width, height) down so the longer side is at most `maxEdge`; never scales up. */
export function fitWithin(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Fall back to an <img>, which can read a few formats the bitmap decoder can't.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function encode(decoded: Decoded, maxEdge: number, quality: number): Promise<Blob> {
  const { width, height } = fitWithin(decoded.width, decoded.height, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('Could not process the image.'));
  // JPEG has no transparency, so put anything see-through on white.
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.drawImage(decoded.source, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not process the image.'))),
      'image/jpeg',
      quality,
    );
  });
}

/**
 * Turns a camera or library image into a reasonably small JPEG plus a
 * thumbnail. Re-encoding also drops EXIF data, including any GPS position
 * embedded in the photo.
 */
export const processImage: ImageProcessor = async (file) => {
  let decoded: Decoded;
  try {
    decoded = await decode(file);
  } catch {
    throw new Error("That file couldn't be read as an image.");
  }
  try {
    const full = await encode(decoded, FULL_MAX_EDGE, FULL_QUALITY);
    const thumb = await encode(decoded, THUMB_MAX_EDGE, THUMB_QUALITY);
    const size = fitWithin(decoded.width, decoded.height, FULL_MAX_EDGE);
    return { full, thumb, ...size };
  } finally {
    decoded.release();
  }
};

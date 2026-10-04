/** Detect an image type from magic bytes (avatars and uploads). Mirrors backend/utils/image_format.py. */

export interface DetectedImage {
  ext: string;
  contentType: string;
}

const startsWith = (b: Uint8Array, sig: readonly number[]) => sig.every((byte, i) => b[i] === byte);
const ascii = (b: Uint8Array, start: number, end: number) => String.fromCharCode(...b.subarray(start, end));

/** JPEG, PNG or WebP from the first bytes of a file (needs at least 12). */
export function detectImageFormat(header: Uint8Array): DetectedImage | null {
  if (header.length < 12) return null;
  if (startsWith(header, [0xff, 0xd8, 0xff])) return { ext: 'jpg', contentType: 'image/jpeg' };
  if (startsWith(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: 'png', contentType: 'image/png' };
  if (ascii(header, 0, 4) === 'RIFF' && ascii(header, 8, 12) === 'WEBP') return { ext: 'webp', contentType: 'image/webp' };
  return null;
}

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx']);

/** Like `detectImageFormat` but also accepts HEIC/HEIF (`ftyp` brand sniffing). Used by receipts (R3). */
export function detectReceiptImageFormat(header: Uint8Array): DetectedImage | null {
  const detected = detectImageFormat(header);
  if (detected) return detected;
  if (header.length >= 12 && ascii(header, 4, 8) === 'ftyp') {
    const brand = ascii(header, 8, 12);
    if (HEIC_BRANDS.has(brand)) return { ext: 'heic', contentType: 'image/heic' };
    if (HEIF_BRANDS.has(brand)) return { ext: 'heif', contentType: 'image/heif' };
  }
  return null;
}

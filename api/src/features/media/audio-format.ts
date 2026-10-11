/** Detect a recorded-voice container from magic bytes (never trust the client MIME). Port of backend `utils/audio_format.py`. */
export interface DetectedAudio {
  ext: string;
  contentType: string;
}

const startsWith = (b: Uint8Array, sig: readonly number[]) => sig.every((byte, i) => b[i] === byte);
const ascii = (b: Uint8Array, start: number, end: number) => String.fromCharCode(...b.subarray(start, end));

/** Covers what the app records (m4a/mp4, wav, mp3, webm, caf) plus aac and ogg. Needs at least 12 bytes. */
export function detectAudioFormat(header: Uint8Array): DetectedAudio | null {
  if (header.length < 12) return null;
  if (ascii(header, 0, 4) === 'RIFF' && ascii(header, 8, 12) === 'WAVE') return { ext: 'wav', contentType: 'audio/wav' };
  if (ascii(header, 4, 8) === 'ftyp') return { ext: 'm4a', contentType: 'audio/mp4' };
  if (ascii(header, 0, 3) === 'ID3') return { ext: 'mp3', contentType: 'audio/mpeg' };
  const b0 = header[0] ?? 0;
  const b1 = header[1] ?? 0;
  if (b0 === 0xff && (b1 & 0xe0) === 0xe0) {
    // MPEG audio frame sync; layer bits 00 mean ADTS AAC rather than MP3.
    return (b1 & 0x06) === 0 ? { ext: 'aac', contentType: 'audio/aac' } : { ext: 'mp3', contentType: 'audio/mpeg' };
  }
  if (ascii(header, 0, 4) === 'OggS') return { ext: 'ogg', contentType: 'audio/ogg' };
  if (startsWith(header, [0x1a, 0x45, 0xdf, 0xa3])) return { ext: 'webm', contentType: 'audio/webm' };
  if (ascii(header, 0, 4) === 'caff') return { ext: 'caf', contentType: 'audio/x-caf' };
  return null;
}

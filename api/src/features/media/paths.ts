export type UploadKind = 'receipts' | 'voice_inputs';

const DEFAULT_EXTENSION: Record<UploadKind, string> = { receipts: 'jpg', voice_inputs: 'wav' };

function normalizeExtension(ext: string | null | undefined, kind: UploadKind): string {
  const cleaned = (ext ?? '').trim().replace(/^\.+/, '').toLowerCase();
  return cleaned || DEFAULT_EXTENSION[kind];
}

function randomHex8(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Private-bucket object path: `{kind}/{user}/{kind}/{YYYY-MM-DD}/{ms}-{8hex}.{ext}`
 * (same layout the Python backend used, so existing objects and new ones live side by side).
 */
export function buildObjectPath(input: {
  kind: UploadKind;
  userId: string;
  extension?: string | null;
  now?: Date;
  random?: () => string;
}): string {
  const now = input.now ?? new Date();
  const day = now.toISOString().slice(0, 10);
  const rand = (input.random ?? randomHex8)();
  return `${input.kind}/${input.userId}/${input.kind}/${day}/${now.getTime()}-${rand}.${normalizeExtension(input.extension, input.kind)}`;
}

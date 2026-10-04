import { UpstreamError } from '../../core/errors';
import { log } from '../../core/logging';
import type { DimeSupabaseClient } from '../../core/supabase';
import { buildObjectPath } from './paths';
import type { UploadKind } from './paths';
import { splitStoredMediaRef } from './refs';

export interface SignOptions {
  /** Bucket for bare object paths (the private bucket). */
  defaultBucket: string;
  expiresIn: number;
}

/**
 * Batch-sign stored media refs: `{stored value: signed URL | null}`. One `createSignedUrls` call per
 * bucket, run concurrently. A storage failure is logged and maps to null so it never breaks the
 * surrounding API response (same contract as the Python `sign_media_urls`).
 */
export async function signMediaUrls(
  db: DimeSupabaseClient,
  storedValues: readonly (string | null | undefined)[],
  options: SignOptions,
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  const byBucket = new Map<string, Map<string, string[]>>();
  for (const stored of storedValues) {
    if (!stored || result.has(stored)) continue;
    result.set(stored, null);
    const ref = splitStoredMediaRef(stored, options.defaultBucket);
    if (!ref) continue;
    const paths = byBucket.get(ref.bucket) ?? new Map<string, string[]>();
    const owners = paths.get(ref.objectPath) ?? [];
    owners.push(stored);
    paths.set(ref.objectPath, owners);
    byBucket.set(ref.bucket, paths);
  }

  await Promise.all(
    [...byBucket].map(async ([bucket, paths]) => {
      try {
        const { data, error } = await db.storage.from(bucket).createSignedUrls([...paths.keys()], options.expiresIn);
        if (error) throw error;
        for (const item of data) {
          if (item.error || !item.signedUrl || !item.path) continue;
          for (const stored of paths.get(item.path) ?? []) result.set(stored, item.signedUrl);
        }
      } catch (err) {
        log.warn('storage_batch_signing_failed', { bucket, err });
      }
    }),
  );
  return result;
}

export interface UploadInput {
  bucket: string;
  userId: string;
  kind: UploadKind;
  bytes: Uint8Array | ArrayBuffer;
  contentType: string;
  extension?: string | null;
}

/** Upload raw media to the (private) bucket under a fresh path; returns the object path to store. */
export async function uploadMedia(db: DimeSupabaseClient, input: UploadInput): Promise<string> {
  const objectPath = buildObjectPath({ kind: input.kind, userId: input.userId, extension: input.extension });
  const { error } = await db.storage
    .from(input.bucket)
    .upload(objectPath, input.bytes, { contentType: input.contentType, upsert: true });
  if (error) {
    log.error('media_upload_failed', { err: error, bucket: input.bucket, kind: input.kind });
    throw new UpstreamError('Could not store media.');
  }
  return objectPath;
}

/** Fetch a stored object (jobs keep only the path, never the media bytes). */
export async function downloadMedia(db: DimeSupabaseClient, bucket: string, objectPath: string): Promise<Uint8Array> {
  const { data, error } = await db.storage.from(bucket).download(objectPath);
  if (error) throw new UpstreamError('Could not read stored media.', { cause: error });
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * A short-lived signed https URL for a private object, for handing to a third party (Groq vision).
 * Returns null when signing fails or the URL is not https (e.g. a local Supabase), so the caller can
 * fall back to sending the bytes. Never throws.
 */
export async function signShortLivedUrl(db: DimeSupabaseClient, bucket: string, objectPath: string, expiresIn: number): Promise<string | null> {
  try {
    const { data, error } = await db.storage.from(bucket).createSignedUrl(objectPath, expiresIn);
    if (error) throw error;
    if (!data.signedUrl.startsWith('https://')) return null;
    return data.signedUrl;
  } catch (err) {
    log.warn('media_short_url_failed', { bucket, err });
    return null;
  }
}

/** Best-effort cleanup (e.g. an upload whose job was a replay); never throws. */
export async function deleteMediaQuietly(db: DimeSupabaseClient, bucket: string, objectPath: string): Promise<void> {
  try {
    const { error } = await db.storage.from(bucket).remove([objectPath]);
    if (error) throw error;
  } catch (err) {
    log.warn('media_cleanup_failed', { bucket, objectPath, err });
  }
}

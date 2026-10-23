import {
  copyAsync,
  deleteAsync,
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  readDirectoryAsync,
} from "expo-file-system/legacy";

import type { OutboxFile } from "./outboxTypes";

const OUTBOX_DIR = documentDirectory ? `${documentDirectory}outbox/` : null;

/**
 * Copies a capture (voice note / receipt photo) into app storage that the OS does not clear, so it
 * survives until it uploads. Returns null when it could not be copied; callers then keep the
 * original path, which usually still exists for the rest of the session.
 */
export async function copyCaptureToOutbox(
  sourceUri: string,
  file: { name: string; mimeType: string },
  id: string,
): Promise<OutboxFile | null> {
  if (!OUTBOX_DIR) {
    return null;
  }
  try {
    await makeDirectoryAsync(OUTBOX_DIR, { intermediates: true });
    const extension = /\.[a-z0-9]{1,5}$/i.exec(file.name)?.[0] ?? "";
    const target = `${OUTBOX_DIR}${id}${extension}`;
    await copyAsync({ from: sourceUri, to: target });
    return { uri: target, name: file.name, mimeType: file.mimeType };
  } catch {
    return null;
  }
}

export async function outboxFileExists(uri: string): Promise<boolean> {
  try {
    return (await getInfoAsync(uri)).exists;
  } catch {
    return false;
  }
}

/** Only files this module copied are deleted (never the recorder's / camera's original). */
export async function deleteOutboxFile(uri: string | undefined): Promise<void> {
  if (!uri || !OUTBOX_DIR || !uri.startsWith(OUTBOX_DIR)) {
    return;
  }
  try {
    await deleteAsync(uri, { idempotent: true });
  } catch {
    /* already gone */
  }
}

/** Wipe: the whole folder. */
export async function deleteAllOutboxFiles(): Promise<void> {
  if (!OUTBOX_DIR) {
    return;
  }
  try {
    await deleteAsync(OUTBOX_DIR, { idempotent: true });
  } catch {
    /* already gone */
  }
}

/** A file this young may still be between "copied" and "queued"; never touch it. */
const ORPHAN_GRACE_MS = 10 * 60 * 1000;

/**
 * Deletes saved captures that no outbox item points at (an app kill between removing an item and
 * deleting its file leaves one). Files copied in the last few minutes are spared: they may be about
 * to be queued.
 */
export async function pruneOrphanOutboxFiles(
  referencedUris: readonly string[],
  now: number = Date.now(),
): Promise<void> {
  if (!OUTBOX_DIR) {
    return;
  }
  try {
    const referenced = new Set(referencedUris);
    for (const name of await readDirectoryAsync(OUTBOX_DIR)) {
      const uri = `${OUTBOX_DIR}${name}`;
      if (referenced.has(uri)) {
        continue;
      }
      const info = await getInfoAsync(uri);
      const modifiedMs = info.exists && "modificationTime" in info ? info.modificationTime * 1000 : 0;
      if (info.exists && now - modifiedMs > ORPHAN_GRACE_MS) {
        await deleteAsync(uri, { idempotent: true });
      }
    }
  } catch {
    /* no folder yet, or unreadable: nothing to prune */
  }
}

import { create } from "zustand";

import {
  loadOutboxItems,
  saveOutboxItems,
} from "@/lib/outbox/outboxStorage";
import type { OutboxItem } from "@/lib/outbox/outboxTypes";

type OutboxState = {
  /** Whose items these are (null until the signed-in user is known). */
  userId: string | null;
  /** Oldest first. The in-memory mirror of what MMKV holds for `userId`. */
  items: OutboxItem[];
  /** A drain is uploading right now. */
  syncing: boolean;
  /** Loads `userId`'s outbox from disk (a no-op when it is already the loaded user). */
  hydrate: (userId: string) => void;
  add: (userId: string, item: OutboxItem) => void;
  /** Applies `change` to the item; returning null removes it. Unknown ids are ignored. */
  update: (id: string, change: (item: OutboxItem) => OutboxItem | null) => void;
  /** Applies `change` to every item (e.g. a shared backoff). */
  updateAll: (change: (item: OutboxItem) => OutboxItem) => void;
  remove: (id: string) => void;
  setSyncing: (syncing: boolean) => void;
  /** Forgets everything in memory (the wipe clears the disk side). */
  reset: () => void;
};

/**
 * Mirror of the current user's outbox for the UI and the drain. Every change is written through to
 * MMKV, so an app kill loses nothing. Never put these items in the React Query cache.
 */
export const useOutboxStore = create<OutboxState>((set, get) => {
  /** Commits `items` for the loaded user to memory and disk. */
  function commit(items: OutboxItem[]): void {
    const { userId } = get();
    set({ items });
    if (userId) {
      saveOutboxItems(userId, items);
    }
  }

  return {
    userId: null,
    items: [],
    syncing: false,
    hydrate: (userId) => {
      if (get().userId === userId) {
        return;
      }
      set({ userId, items: loadOutboxItems(userId) });
    },
    add: (userId, item) => {
      get().hydrate(userId);
      commit([...get().items.filter((existing) => existing.id !== item.id), item]);
    },
    update: (id, change) => {
      const { items } = get();
      if (!items.some((item) => item.id === id)) {
        return;
      }
      const next: OutboxItem[] = [];
      for (const item of items) {
        if (item.id !== id) {
          next.push(item);
          continue;
        }
        const changed = change(item);
        if (changed) {
          next.push(changed);
        }
      }
      commit(next);
    },
    updateAll: (change) => {
      if (get().items.length > 0) {
        commit(get().items.map(change));
      }
    },
    remove: (id) => {
      get().update(id, () => null);
    },
    setSyncing: (syncing) => {
      if (get().syncing !== syncing) {
        set({ syncing });
      }
    },
    reset: () => {
      set({ userId: null, items: [], syncing: false });
    },
  };
});

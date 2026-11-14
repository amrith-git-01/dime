import { useCallback, useEffect, useMemo, useState } from "react";

import {
  DEFAULT_USER_SETTINGS,
  type UserSettings,
  type UserSettingsPatch,
} from "../types";
import {
  buildSettingsPatch,
  sameSettingsField,
  settingsEqual,
  type SettingsDraftKey,
} from "../utils/settingsDraft";
import { useUpdateUserSettingsMutation } from "./useUpdateUserSettingsMutation";
import { useUserSettingsQuery } from "./useUserSettingsQuery";

type Edits<K extends SettingsDraftKey> = Partial<Pick<UserSettings, K>>;

/** Edits to merge into the draft, or a function that reads the current draft first (toggling a list item). */
type DraftUpdate<K extends SettingsDraftKey> =
  | Edits<K>
  | ((draft: UserSettings) => Edits<K>);

/** Drops the edits that already match the saved settings; returns the same object when none do. */
function pruneEdits<K extends SettingsDraftKey>(
  edits: Edits<K>,
  saved: UserSettings | null,
): Edits<K> {
  if (!saved) {
    return edits;
  }
  const keys = Object.keys(edits) as K[];
  const kept = keys.filter(
    (key) => !sameSettingsField(key, { ...saved, ...edits }, saved),
  );
  if (kept.length === keys.length) {
    return edits;
  }
  const next: Edits<K> = {};
  for (const key of kept) {
    next[key] = edits[key];
  }
  return next;
}

/**
 * A draft of one slice of the settings (`keys`), saved on its own: a screen that edits a few
 * settings gets its own Save and Clear without touching the rest.
 *
 * - Only the slice's edits are held; every other setting reads straight from the saved copy. A save
 *   from another screen (or a refetch) therefore never wipes an unsaved edit, and a slice that is
 *   not dirty follows the saved values.
 * - `save` sends only the slice's changed settings (optionally adjusted by `prepare`) and resolves
 *   with the draft that was sent, or null when nothing changed. It throws when the save fails; the
 *   edits stay so the user can try again.
 * - `syncKey` goes up on Clear, for controls that keep their own text state (the Custom % field).
 */
export function useSettingsDraft<K extends SettingsDraftKey>(
  keys: readonly K[],
) {
  const settingsQuery = useUserSettingsQuery();
  const updateMutation = useUpdateUserSettingsMutation();
  const { mutateAsync } = updateMutation;

  const saved = settingsQuery.data ?? null;
  const [edits, setEdits] = useState<Edits<K>>({});
  const [syncKey, setSyncKey] = useState(0);

  // Settings that now match what the user typed (saved here or on another device) are no longer edits.
  useEffect(() => {
    setEdits((prev) => pruneEdits(prev, saved));
  }, [saved]);

  const draft = useMemo<UserSettings>(
    () => ({ ...(saved ?? DEFAULT_USER_SETTINGS), ...edits }),
    [edits, saved],
  );

  const isDirty = useMemo(
    () => saved !== null && !settingsEqual(draft, saved, keys),
    [draft, keys, saved],
  );

  const patchDraft = useCallback(
    (update: DraftUpdate<K>) => {
      setEdits((prev) => {
        const base = { ...(saved ?? DEFAULT_USER_SETTINGS), ...prev };
        const changes = typeof update === "function" ? update(base) : update;
        return pruneEdits({ ...prev, ...changes }, saved);
      });
    },
    [saved],
  );

  const clear = useCallback(() => {
    setEdits({});
    setSyncKey((key) => key + 1);
  }, []);

  const save = useCallback(
    async (
      prepare?: (patch: UserSettingsPatch) => UserSettingsPatch,
    ): Promise<UserSettings | null> => {
      if (!saved) {
        return null;
      }
      const patch = buildSettingsPatch(saved, draft, keys);
      if (!patch) {
        return null;
      }
      await mutateAsync(prepare ? prepare(patch) : patch);
      // Drop only what was sent: an edit typed while the save was in flight stays.
      setEdits((prev) => pruneEdits(prev, draft));
      return draft;
    },
    [draft, keys, mutateAsync, saved],
  );

  return {
    draft,
    saved,
    patchDraft,
    isDirty,
    clear,
    save,
    syncKey,
    saving: updateMutation.isPending,
    /** The settings have loaded, so Save has something to compare against. */
    isReady: saved !== null,
    isInitialLoading:
      settingsQuery.isPending && settingsQuery.data === undefined,
    isError: settingsQuery.isError,
    refetch: settingsQuery.refetch,
  };
}

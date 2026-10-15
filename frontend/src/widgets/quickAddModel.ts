import {
  canUndoWidgetAction,
  type WidgetLastAction,
  type WidgetPreset,
} from "@/lib/widgets/widgetPresetsMmkv";
import { formatInrCompact } from "@/utils/currency";

import { maskAmount } from "./widgetFormat";

/** The presets and the status line need a 4x2; a 4x1 is just the three buttons. */
const PRESET_ROW_MIN_HEIGHT_DP = 110;
/** "Adding..." that never resolved (the process died) stops being shown after this. */
const ADDING_TTL_MS = 60_000;
/** How long a result stays on the status line. */
const STATUS_TTL_MS = 10 * 60_000;

export const QUEUED_STATUS = "Queued · adds when online";

export type QuickAddPresetButton = {
  index: number;
  /** "Chai ₹20". */
  text: string;
  accessibilityLabel: string;
};

export type QuickAddStatus = {
  text: string;
  /** Whether the Undo link shows. */
  undo: boolean;
  /** Tapping the line opens the app (the sign-in prompt). */
  opensApp: boolean;
};

export type QuickAddModel = {
  showPresetRow: boolean;
  presets: QuickAddPresetButton[];
  /** No presets yet: the row shows a "Set up presets" button instead. */
  showSetup: boolean;
  status: QuickAddStatus | null;
};

export function quickAddShowsPresetRow(heightDp: number): boolean {
  return heightDp >= PRESET_ROW_MIN_HEIGHT_DP;
}

function statusFor(
  action: WidgetLastAction | null,
  outboxCount: number,
  now: number,
  hideAmounts: boolean,
): QuickAddStatus | null {
  if (action) {
    const age = now - action.at;
    const fresh = action.kind === "adding" ? age <= ADDING_TTL_MS : age <= STATUS_TTL_MS;
    if (fresh) {
      const what = `${maskAmount(formatInrCompact(action.amount), hideAmounts)} · ${action.label}`;
      const undo = canUndoWidgetAction(action, now);
      switch (action.kind) {
        case "adding":
          return { text: `Adding ${what}…`, undo: false, opensApp: false };
        case "added":
          return { text: `Added ${what}`, undo, opensApp: false };
        case "queued":
          return { text: QUEUED_STATUS, undo, opensApp: false };
        case "duplicate":
          return { text: "Already added", undo: false, opensApp: false };
        case "undoing":
          return { text: "Undoing…", undo: false, opensApp: false };
        case "failed":
          return { text: "Couldn't add", undo: false, opensApp: false };
        case "signedOut":
          return { text: "Sign in to Dime", undo: false, opensApp: true };
        case "undone":
          return { text: "Undone", undo: false, opensApp: false };
        case "undoFailed":
          return { text: "Couldn't undo", undo, opensApp: false };
      }
    }
  }
  return outboxCount > 0
    ? { text: QUEUED_STATUS, undo: false, opensApp: false }
    : null;
}

export function buildQuickAddModel(input: {
  signedOut: boolean;
  presets: readonly WidgetPreset[];
  lastAction: WidgetLastAction | null;
  outboxCount: number;
  heightDp: number;
  now?: number;
  hideAmounts?: boolean;
}): QuickAddModel {
  const now = input.now ?? Date.now();
  const hideAmounts = input.hideAmounts ?? false;
  const presets = input.presets.map((preset, index) => {
    const amount = maskAmount(formatInrCompact(preset.amount), hideAmounts);
    return {
      index,
      text: `${preset.label} ${amount}`,
      accessibilityLabel: `Add ${preset.label}, ${amount}`,
    };
  });
  return {
    showPresetRow: quickAddShowsPresetRow(input.heightDp),
    presets,
    showSetup: !input.signedOut && presets.length === 0,
    status: input.signedOut
      ? { text: "Sign in to Dime", undo: false, opensApp: true }
      : statusFor(input.lastAction, input.outboxCount, now, hideAmounts),
  };
}

import { Dimensions } from "react-native";

import { spacing } from "@/constants";

export type SelectDropdownSize = "default" | "compact";
export type SelectDropdownVariant = "default" | "primary" | "secondary";

export const MENU_GAP = 6;
export const MENU_GAP_COMPACT = 4;
export const PANEL_MAX_HEIGHT = 280;
export const COMPACT_TRIGGER_HEIGHT = 28;
export const COMPACT_OPTION_ROW_HEIGHT = 32;
const DEFAULT_TRIGGER_HEIGHT = 52;

export type MenuRect = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

export function optionRowHeight(size: SelectDropdownSize): number {
  return size === "compact" ? COMPACT_OPTION_ROW_HEIGHT : 46;
}

export function resolvePanelScrollHeight(
  size: SelectDropdownSize,
  optionCount: number,
  maxVisibleOptions?: number,
): number {
  const rowHeight = optionRowHeight(size);
  const visibleRows = maxVisibleOptions
    ? Math.min(optionCount, maxVisibleOptions)
    : optionCount;
  const contentHeight = visibleRows * rowHeight + spacing.xs * 2;
  return Math.min(contentHeight, PANEL_MAX_HEIGHT);
}

function triggerHeightFallback(size: SelectDropdownSize): number {
  return size === "compact" ? COMPACT_TRIGGER_HEIGHT : DEFAULT_TRIGGER_HEIGHT;
}

function menuGap(size: SelectDropdownSize): number {
  return size === "compact" ? MENU_GAP_COMPACT : MENU_GAP;
}

/** When capped, panel height matches scroll viewport (not full space below). */
function cappedPanelMaxHeight(
  preferredHeight: number,
  maxVisibleOptions: number | undefined,
  spaceBelow: number,
  minDropHeight: number,
): number {
  if (maxVisibleOptions != null) {
    return preferredHeight;
  }
  return Math.max(
    minDropHeight,
    Math.min(preferredHeight, Math.max(spaceBelow, minDropHeight)),
  );
}

export function resolveMenuRect(
  triggerLeft: number,
  triggerTop: number,
  triggerWidth: number,
  triggerHeight: number,
  optionCount: number,
  size: SelectDropdownSize,
  maxVisibleOptions?: number,
  menuOpenDirection: "auto" | "below" = "auto",
): MenuRect {
  const gap = menuGap(size);
  const windowHeight = Dimensions.get("window").height;
  const preferredHeight = resolvePanelScrollHeight(
    size,
    optionCount,
    maxVisibleOptions,
  );
  const resolvedTriggerHeight =
    triggerHeight > 0 ? triggerHeight : triggerHeightFallback(size);
  const triggerBottom = triggerTop + resolvedTriggerHeight;
  const belowTop = triggerBottom + gap;
  const spaceBelow = windowHeight - belowTop - spacing.lg;
  const spaceAbove = triggerTop - gap - spacing.lg;
  const minDropHeight = optionRowHeight(size) + spacing.xs * 2;

  const openBelow = (maxHeight: number): MenuRect => ({
    left: triggerLeft,
    top: belowTop,
    width: triggerWidth,
    maxHeight,
  });

  if (menuOpenDirection === "below" || spaceBelow >= minDropHeight) {
    return openBelow(
      cappedPanelMaxHeight(
        preferredHeight,
        maxVisibleOptions,
        spaceBelow,
        minDropHeight,
      ),
    );
  }

  const maxHeightAbove = Math.min(
    preferredHeight,
    Math.max(spaceAbove, minDropHeight),
  );
  return {
    left: triggerLeft,
    top: Math.max(spacing.lg, triggerTop - gap - maxHeightAbove),
    width: triggerWidth,
    maxHeight: maxHeightAbove,
  };
}

export function resolveMenuRectBelowAnchor(
  anchorBottom: number,
  triggerLeft: number,
  triggerWidth: number,
  optionCount: number,
  size: SelectDropdownSize,
  maxVisibleOptions?: number,
): MenuRect {
  const gap = menuGap(size);
  const belowTop = anchorBottom + gap;
  const windowHeight = Dimensions.get("window").height;
  const preferredHeight = resolvePanelScrollHeight(
    size,
    optionCount,
    maxVisibleOptions,
  );
  const minDropHeight = optionRowHeight(size) + spacing.xs * 2;
  const spaceBelow = windowHeight - belowTop - spacing.lg;

  return {
    left: triggerLeft,
    top: belowTop,
    width: triggerWidth,
    maxHeight: cappedPanelMaxHeight(
      preferredHeight,
      maxVisibleOptions,
      spaceBelow,
      minDropHeight,
    ),
  };
}

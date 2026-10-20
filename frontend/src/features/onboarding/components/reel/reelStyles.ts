import { StyleSheet } from "react-native";

import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { createThemedStyles } from "@/theme";

/** Inside the card (card width/height minus the lg padding on each side). */
export const SCENE_WIDTH = 288;
export const SCENE_HEIGHT = 232;

export const HEADER_HEIGHT = 64;
export const ROW_HEIGHT = 52;
export const LIST_HEIGHT = ROW_HEIGHT * 3;

/**
 * Row, tile, chip and header styles copied from the original welcome hero, so every scene
 * speaks the same visual language.
 */
export const useReelStyles = createThemedStyles(({ colors }) => ({
  scene: {
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
  },
  header: {
    height: HEADER_HEIGHT,
    justifyContent: "center",
    gap: spacing.xs,
  },
  headerLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  headerTotal: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.4,
    color: colors.ink,
  },
  list: {
    marginTop: spacing.md,
    marginHorizontal: -spacing.sm,
    height: LIST_HEIGHT,
    overflow: "hidden",
  },
  slot: {
    overflow: "hidden",
  },
  entry: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.accentTint,
  },
  /** Content of an `entry` that is drawn as an overlay layer. */
  entryLayer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  tile: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: colors.surfaceSunken,
  },
  tileEntry: {
    backgroundColor: colors.surface,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    alignItems: "flex-start",
  },
  rowTitle: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
  rowMeta: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  rowAmount: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
  chip: {
    paddingVertical: 1,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  chipText: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 15,
    color: colors.accentText,
  },
  /** Centers a glyph over its tile. */
  tileGlyph: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
}));

import type { ViewStyle } from "react-native";

/** Horizontal value-placeholder sizes aligned to bento typography. */
export type SkeletonStripVariant =
  | "amountHero"
  | "statValue"
  | "subtext"
  | "listTitle"
  | "listMeta"
  | "listAmount";

export const skeletonStripPresets: Record<SkeletonStripVariant, ViewStyle> = {
  amountHero: {
    height: 28,
    width: "72%",
    borderRadius: 4,
    marginBottom: 2,
  },
  statValue: {
    height: 20,
    width: "80%",
    borderRadius: 4,
  },
  subtext: {
    height: 10,
    width: "80%",
    borderRadius: 4,
  },
  listTitle: {
    height: 14,
    width: "60%",
    borderRadius: 4,
  },
  listMeta: {
    height: 10,
    width: "40%",
    borderRadius: 4,
  },
  listAmount: {
    height: 16,
    width: 50,
    borderRadius: 4,
  },
};

import type { ViewStyle } from "react-native";

import { radius } from "@/constants";

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
    borderRadius: radius.xs,
    marginBottom: 2,
  },
  statValue: {
    height: 20,
    width: "80%",
    borderRadius: radius.xs,
  },
  subtext: {
    height: 10,
    width: "80%",
    borderRadius: radius.xs,
  },
  listTitle: {
    height: 14,
    width: "60%",
    borderRadius: radius.xs,
  },
  listMeta: {
    height: 10,
    width: "40%",
    borderRadius: radius.xs,
  },
  listAmount: {
    height: 16,
    width: 50,
    borderRadius: radius.xs,
  },
};

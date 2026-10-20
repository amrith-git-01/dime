import { memo, type ComponentProps } from "react";
import { Text, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";

import { CategoryLucideIcon } from "@/components/categories/CategoryLucideIcon";
import { withAlpha } from "@/constants";
import {
  SEEDED_SYSTEM_CATEGORIES,
  type SeededSystemCategory,
} from "@/constants/systemCategories";
import { useTheme } from "@/theme";
import { formatInrCompact } from "@/utils/currency";

import { type ReelPayee } from "./reelStory";
import { useReelStyles } from "./reelStyles";

export type ReelSceneProps = {
  /** ms since the scene started (linear). */
  clock: SharedValue<number>;
  /** Clock value the scene starts from: 0 to play, the end of the timeline for the final frame. */
  initialMs: number;
};

/** Real seeded system categories, so the reel shows the icons and colors users will see. */
export const REEL_CATEGORIES = {
  food: SEEDED_SYSTEM_CATEGORIES.food,
  shopping: SEEDED_SYSTEM_CATEGORIES.shopping,
  transport: SEEDED_SYSTEM_CATEGORIES.transport,
} as const;

/** Reel copy is decoration with fixed geometry, so it does not follow the system font scale. */
export function ReelText(props: ComponentProps<typeof Text>) {
  return <Text allowFontScaling={false} {...props} />;
}

/** The round category tile of a transaction row: category icon on a tint of its color. */
export const CategoryTile = memo(function CategoryTile({
  category,
}: {
  category: SeededSystemCategory;
}) {
  const { colors } = useTheme();
  const styles = useReelStyles();
  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: withAlpha(category.color, colors.categoryTileAlpha) },
      ]}
    >
      <CategoryLucideIcon
        iconName={category.icon_name}
        color={category.color}
        size={18}
        strokeWidth={2}
      />
    </View>
  );
});

type ReelRowProps = {
  category: SeededSystemCategory;
  title: string;
  meta: string;
  amount: number;
};

/** A static transaction row: the neighbours a new entry lands next to. */
export const ReelRow = memo(function ReelRow({
  category,
  title,
  meta,
  amount,
}: ReelRowProps) {
  const styles = useReelStyles();
  return (
    <View style={styles.row}>
      <CategoryTile category={category} />
      <View style={styles.rowText}>
        <ReelText style={styles.rowTitle}>{title}</ReelText>
        <ReelText style={styles.rowMeta}>{meta}</ReelText>
      </View>
      <ReelText style={styles.rowAmount}>{formatInrCompact(amount)}</ReelText>
    </View>
  );
});

/** A `ReelRow` for one of the story's payees (title, category and amount from `reelStory`). */
export function ReelPayeeRow({ payee }: { payee: ReelPayee }) {
  const category = REEL_CATEGORIES[payee.category];
  return (
    <ReelRow
      category={category}
      title={payee.title}
      meta={category.name}
      amount={payee.amount}
    />
  );
}

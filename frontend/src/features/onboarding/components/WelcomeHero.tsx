import { Bus, Coffee, ShoppingBasket } from "lucide-react-native";
import { useEffect, useState, type ComponentType } from "react";
import { Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { springs } from "@/constants/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { createThemedStyles, useTheme } from "@/theme";
import { formatInrCompact } from "@/utils/currency";

const HERO_WIDTH = 320;
const ROW_HEIGHT = 52;
const LIST_HEIGHT = ROW_HEIGHT * 3;
const HERO_HEIGHT = 16 + 64 + 12 + LIST_HEIGHT + 16;
/** Below this much room the hero is dropped rather than squeezed into something unreadable. */
const MIN_HERO_HEIGHT = 120;
const MIN_SCALE = 0.55;

const ENTRY_AMOUNT = 120;
const START_TOTAL = 4740;
const FINAL_TOTAL = START_TOTAL + ENTRY_AMOUNT;

// The ~3 s story: the entry slides in, the total counts up, the category chip pops, then it holds.
const SLIDE_DELAY_MS = 500;
const SLIDE_MS = 600;
const COUNT_DELAY_MS = 1100;
const COUNT_MS = 900;
const CHIP_DELAY_MS = 2000;

type RowIcon = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

const EXISTING_ROWS: readonly {
  title: string;
  meta: string;
  amount: number;
  Icon: RowIcon;
}[] = [
  { title: "Groceries", meta: "Food", amount: 860, Icon: ShoppingBasket },
  { title: "Metro", meta: "Travel", amount: 45, Icon: Bus },
  { title: "Lunch", meta: "Food", amount: 210, Icon: Coffee },
];

export type WelcomeHeroProps = {
  /** Height the layout can spare; the hero scales down to fit (and hides when there is no room). */
  availableHeight: number;
};

/**
 * Welcome screen illustration drawn in code: a sample "₹120 · Chai" entry slides into a mini
 * list, the month total counts up and a category chip pops. Plays once (~3 s) and holds; with
 * reduced motion it shows the final frame.
 */
export function WelcomeHero({ availableHeight }: WelcomeHeroProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();

  const slide = useSharedValue(0);
  const total = useSharedValue(START_TOTAL);
  const chip = useSharedValue(0);
  const [displayTotal, setDisplayTotal] = useState(START_TOTAL);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(slide);
      cancelAnimation(total);
      cancelAnimation(chip);
      slide.value = 1;
      total.value = FINAL_TOTAL;
      chip.value = 1;
      return;
    }
    slide.value = withDelay(
      SLIDE_DELAY_MS,
      withTiming(1, { duration: SLIDE_MS, easing: Easing.out(Easing.cubic) }),
    );
    total.value = withDelay(
      COUNT_DELAY_MS,
      withTiming(FINAL_TOTAL, {
        duration: COUNT_MS,
        easing: Easing.out(Easing.cubic),
      }),
    );
    chip.value = withDelay(CHIP_DELAY_MS, withSpring(1, springs.bouncy));
  }, [reduceMotion, slide, total, chip]);

  // The count-up renders through React state: one small text, a ₹120 range, once per visit.
  useAnimatedReaction(
    () => Math.round(total.value),
    (current, previous) => {
      if (current !== previous) {
        runOnJS(setDisplayTotal)(current);
      }
    },
  );

  const slotStyle = useAnimatedStyle(() => ({
    height: slide.value * ROW_HEIGHT,
  }));
  const entryStyle = useAnimatedStyle(() => ({
    opacity: slide.value,
    transform: [{ translateY: (slide.value - 1) * 24 }],
  }));
  const chipStyle = useAnimatedStyle(() => ({
    opacity: chip.value,
    transform: [{ scale: 0.4 + chip.value * 0.6 }],
  }));

  if (availableHeight < MIN_HERO_HEIGHT) {
    return null;
  }
  const fit = Math.max(Math.min(1, availableHeight / HERO_HEIGHT), MIN_SCALE);
  const scaledWidth = HERO_WIDTH * fit;
  const scaledHeight = HERO_HEIGHT * fit;

  return (
    <View
      accessible
      accessibilityLabel="Example: a 120 rupee chai entry is added and the month total goes up"
      style={{ width: scaledWidth, height: scaledHeight }}
    >
      <View
        style={[
          styles.card,
          {
            left: -(HERO_WIDTH - scaledWidth) / 2,
            top: -(HERO_HEIGHT - scaledHeight) / 2,
            transform: [{ scale: fit }],
          },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.headerLabel}>This month</Text>
          <Text style={styles.headerTotal}>
            {formatInrCompact(displayTotal)}
          </Text>
        </View>

        <View style={styles.list}>
          <Animated.View style={[styles.slot, slotStyle]}>
            <Animated.View style={[styles.entry, entryStyle]}>
              <View style={[styles.tile, styles.tileEntry]}>
                <Coffee size={18} color={colors.accentText} strokeWidth={2} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Chai</Text>
                <Animated.View style={[styles.chip, chipStyle]}>
                  <Text style={styles.chipText}>Food &amp; drink</Text>
                </Animated.View>
              </View>
              <Text style={styles.rowAmount}>
                {formatInrCompact(ENTRY_AMOUNT)}
              </Text>
            </Animated.View>
          </Animated.View>

          {EXISTING_ROWS.map(({ title, meta, amount, Icon }) => (
            <View key={title} style={styles.row}>
              <View style={styles.tile}>
                <Icon size={18} color={colors.inkSoft} strokeWidth={2} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{title}</Text>
                <Text style={styles.rowMeta}>{meta}</Text>
              </View>
              <Text style={styles.rowAmount}>{formatInrCompact(amount)}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  card: {
    position: "absolute",
    width: HERO_WIDTH,
    height: HERO_HEIGHT,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  header: {
    height: 64,
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
}));

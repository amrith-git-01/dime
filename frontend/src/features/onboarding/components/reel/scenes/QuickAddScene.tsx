import { Plus } from "lucide-react-native";
import { View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import { CategoryLucideIcon } from "@/components/categories/CategoryLucideIcon";
import { radius, withAlpha } from "@/constants";
import { createThemedStyles, useTheme } from "@/theme";
import { formatInrCompact } from "@/utils/currency";

import {
  REEL_CATEGORIES,
  ReelPayeeRow,
  ReelText,
  type ReelSceneProps,
} from "../ReelParts";
import { easeOut, easeOutBack, lerp, seg } from "../reelMotion";
import {
  MONTH_TOTAL,
  MONTH_TOTAL_BEFORE_QUICK_ADD,
  REEL_PAYEES,
} from "../reelStory";
import { ROW_HEIGHT, useReelStyles } from "../reelStyles";
import { useClockValue } from "../useClockValue";

const ENTRY_AMOUNT = REEL_PAYEES.chai.amount;
const ENTRY_DIGITS = String(ENTRY_AMOUNT);
const START_TOTAL = MONTH_TOTAL_BEFORE_QUICK_ADD;
const FINAL_TOTAL = MONTH_TOTAL;

// "+" is pressed, the entry slides in and its amount is typed, the category lands, the total
// counts up. Animations are done by ~3.3 s; the rest is the hold.
const PRESS_START = 250;
const PRESS_END = 600;
const SLOT_START = 600;
const SLOT_END = 1200;
const TYPE_STEP_MS = 200;
const TYPE_START = 1250;
const TITLE_START = 1900;
const TITLE_END = 2200;
const CHIP_START = 2250;
const CHIP_END = 2700;
const COUNT_START = 2500;
const COUNT_END = 3300;

function readTotal(ms: number): number {
  "worklet";
  return Math.round(
    lerp(START_TOTAL, FINAL_TOTAL, easeOut(seg(ms, COUNT_START, COUNT_END))),
  );
}

function readTypedDigits(ms: number): number {
  "worklet";
  if (ms < TYPE_START) {
    return 0;
  }
  return Math.min(
    ENTRY_DIGITS.length,
    1 + Math.floor((ms - TYPE_START) / TYPE_STEP_MS),
  );
}

/** Scene 3: tap "+", type an amount, the entry lands in the list and the month total counts up. */
export function QuickAddScene({ clock, initialMs }: ReelSceneProps) {
  const styles = useReelStyles();
  const local = useStyles();
  const { colors } = useTheme();
  const food = REEL_CATEGORIES.food;

  const total = useClockValue(clock, readTotal, initialMs);
  const typed = useClockValue(clock, readTypedDigits, initialMs);

  const plusStyle = useAnimatedStyle(() => {
    const ms = clock.value;
    const down = easeOut(seg(ms, PRESS_START, PRESS_START + 110));
    const up = easeOutBack(seg(ms, PRESS_START + 110, PRESS_END));
    return { transform: [{ scale: 1 - 0.14 * down + 0.14 * up }] };
  });
  const rippleStyle = useAnimatedStyle(() => {
    const p = easeOut(seg(clock.value, PRESS_START, PRESS_END + 200));
    return {
      opacity: p === 0 || p === 1 ? 0 : 0.9 * (1 - p),
      transform: [{ scale: 1 + p * 0.8 }],
    };
  });
  const slotStyle = useAnimatedStyle(() => ({
    height: easeOut(seg(clock.value, SLOT_START, SLOT_END)) * ROW_HEIGHT,
  }));
  const entryStyle = useAnimatedStyle(() => {
    const p = easeOut(seg(clock.value, SLOT_START, SLOT_END));
    return { opacity: p, transform: [{ translateY: (p - 1) * 24 }] };
  });
  const plusGlyphStyle = useAnimatedStyle(() => ({
    opacity: 1 - seg(clock.value, TITLE_START, TITLE_END),
  }));
  const categoryGlyphStyle = useAnimatedStyle(() => ({
    opacity: seg(clock.value, TITLE_START, TITLE_END),
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: seg(clock.value, TITLE_START, TITLE_END),
  }));
  const chipStyle = useAnimatedStyle(() => {
    const p = seg(clock.value, CHIP_START, CHIP_END);
    return {
      opacity: Math.min(1, p * 3),
      transform: [{ scale: 0.4 + easeOutBack(p) * 0.6 }],
    };
  });

  const amountLabel =
    typed === 0
      ? "₹"
      : formatInrCompact(Number(ENTRY_DIGITS.slice(0, typed)));

  return (
    <View style={styles.scene}>
      <View style={local.headerRow}>
        <View style={styles.header}>
          <ReelText style={styles.headerLabel}>This month</ReelText>
          <ReelText style={styles.headerTotal}>
            {formatInrCompact(total)}
          </ReelText>
        </View>
        <View style={local.plusWrap}>
          <Animated.View style={[local.ripple, rippleStyle]} />
          <Animated.View style={[local.plusButton, plusStyle]}>
            <Plus size={18} color={colors.onAccent} strokeWidth={2.4} />
          </Animated.View>
        </View>
      </View>

      <View style={styles.list}>
        <Animated.View style={[styles.slot, slotStyle]}>
          <Animated.View style={[styles.entry, entryStyle]}>
            <View style={[styles.tile, styles.tileEntry]}>
              <Animated.View style={[styles.tileGlyph, plusGlyphStyle]}>
                <Plus size={18} color={colors.inkSoft} strokeWidth={2} />
              </Animated.View>
              <Animated.View
                style={[
                  styles.tileGlyph,
                  { backgroundColor: withAlpha(food.color, colors.categoryTileAlpha) },
                  categoryGlyphStyle,
                ]}
              >
                <CategoryLucideIcon
                  iconName={food.icon_name}
                  color={food.color}
                  size={18}
                  strokeWidth={2}
                />
              </Animated.View>
            </View>
            <View style={styles.rowText}>
              <Animated.View style={titleStyle}>
                <ReelText style={styles.rowTitle}>{REEL_PAYEES.chai.title}</ReelText>
              </Animated.View>
              <Animated.View style={[styles.chip, chipStyle]}>
                <ReelText style={styles.chipText}>{food.name}</ReelText>
              </Animated.View>
            </View>
            <ReelText style={styles.rowAmount}>{amountLabel}</ReelText>
          </Animated.View>
        </Animated.View>

        {/* Newest first: the rows the Voice and Receipt scenes added. */}
        <ReelPayeeRow payee={REEL_PAYEES.smoor} />
        <ReelPayeeRow payee={REEL_PAYEES.swiggy} />
        <ReelPayeeRow payee={REEL_PAYEES.rapido} />
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  plusWrap: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  plusButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  ripple: {
    position: "absolute",
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.accentHeat2,
  },
}));

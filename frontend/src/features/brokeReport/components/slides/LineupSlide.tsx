import { memo } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

import type { ReportTone } from "@/constants/reportPalette";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { tabularNums } from "@/constants/typography";
import {
  easeOut,
  seg,
} from "@/utils/clockMotion";
import { createThemedStyles } from "@/theme";

import type { ReportCategory } from "../../types";
import { formatPercent } from "../../utils/reportFormat";
import { slideAccessibilityLabel } from "../../utils/slideAccessibility";
import {
  heroStyles,
  Kicker,
  Reveal,
  SlideFrame,
  SlideText,
  SupportLine,
  type SlideProps,
} from "./slideParts";

const ROWS_START = 900;
const ROW_STAGGER = 160;
const BAR_MS = 650;
const BAR_HEIGHT = 12;
const MEDAL_SIZE = 32;

/** The "Other" bucket has no rank. */
function isOther(category: ReportCategory): boolean {
  return category.id === null && category.name === "Other";
}

const BarFill = memo(function BarFill({
  clock,
  start,
  fraction,
  color,
}: {
  clock: SharedValue<number>;
  start: number;
  /** 0..1 of the track's width. */
  fraction: number;
  color: string;
}) {
  const styles = useStyles();
  const animated = useAnimatedStyle(() => ({
    transform: [{ scaleX: easeOut(seg(clock.value, start, start + BAR_MS)) }],
  }));
  return (
    <Animated.View
      style={[
        styles.fill,
        { width: `${Math.max(0.02, fraction) * 100}%`, backgroundColor: color },
        animated,
      ]}
    />
  );
});

function CategoryRow({
  category,
  rank,
  maxShare,
  tone,
  clock,
  start,
}: {
  category: ReportCategory;
  rank: number | null;
  maxShare: number;
  tone: ReportTone;
  clock: SharedValue<number>;
  start: number;
}) {
  const styles = useStyles();
  const first = rank === 1;
  return (
    <Reveal clock={clock} start={start} dy={12} style={styles.row}>
      <View
        style={[
          styles.medal,
          { backgroundColor: first ? tone.highlight : tone.panel },
        ]}
      >
        <SlideText
          style={[
            styles.medalText,
            { color: first ? tone.onHighlight : tone.text },
          ]}
        >
          {rank ?? "•"}
        </SlideText>
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <SlideText
            numberOfLines={1}
            style={[styles.rowName, { color: tone.text }]}
          >
            {category.name}
          </SlideText>
          <SlideText style={[styles.rowShare, { color: tone.text }]}>
            {formatPercent(category.share)}
          </SlideText>
        </View>
        <View style={[styles.track, { backgroundColor: tone.panel }]}>
          <BarFill
            clock={clock}
            start={start + 150}
            fraction={maxShare > 0 ? category.share / maxShare : 0}
            color={first ? tone.highlight : tone.textSoft}
          />
        </View>
      </View>
    </Reveal>
  );
}

/** Lineup: the top three categories and everything else, as a ranked set of bars. */
export function LineupSlide({ snapshot, copy, tone, clock }: SlideProps) {
  const styles = useStyles();
  const { categories } = snapshot;
  const top = categories[0];
  const maxShare = Math.max(0, ...categories.map((category) => category.share));
  let rank = 0;

  return (
    <SlideFrame
      tone={tone}
      accessibilityLabel={slideAccessibilityLabel("lineup", snapshot, copy)}
    >
      <Reveal clock={clock} start={0}>
        <Kicker tone={tone}>{copy.lineup.kicker}</Kicker>
      </Reveal>
      <Reveal clock={clock} start={150} pop>
        <SlideText
          numberOfLines={2}
          adjustsFontSizeToFit
          style={[heroStyles.heroWord, { color: tone.text }]}
        >
          {top?.name ?? ""}
        </SlideText>
      </Reveal>
      <Reveal clock={clock} start={550}>
        <SupportLine tone={tone}>{copy.lineup.line}</SupportLine>
      </Reveal>

      <View style={styles.rows}>
        {categories.map((category, index) => {
          const ranked = !isOther(category);
          if (ranked) {
            rank += 1;
          }
          return (
            <CategoryRow
              key={`${category.id ?? category.name}-${index}`}
              category={category}
              rank={ranked ? rank : null}
              maxShare={maxShare}
              tone={tone}
              clock={clock}
              start={ROWS_START + index * ROW_STAGGER}
            />
          );
        })}
      </View>
    </SlideFrame>
  );
}

const useStyles = createThemedStyles(() => ({
  rows: {
    marginTop: spacing.xl,
    gap: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  medal: {
    width: MEDAL_SIZE,
    height: MEDAL_SIZE,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  medalText: {
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    lineHeight: 20,
    fontVariant: tabularNums,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  rowName: {
    flex: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 17,
    lineHeight: 22,
  },
  rowShare: {
    fontFamily: fontFamilies.bold,
    fontSize: 17,
    lineHeight: 22,
    fontVariant: tabularNums,
  },
  track: {
    height: BAR_HEIGHT,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  fill: {
    height: BAR_HEIGHT,
    borderRadius: radius.full,
    transformOrigin: "left center",
  },
}));

import { memo } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import {
  easeOut,
  seg,
} from "@/utils/clockMotion";
import { createThemedStyles } from "@/theme";

import {
  parseAmount,
  weekdayName,
  weekdayShort,
} from "../../utils/reportFormat";
import { slideAccessibilityLabel } from "../../utils/slideAccessibility";
import {
  heroStyles,
  Kicker,
  Reveal,
  SlideFrame,
  SlideText,
  type SlideProps,
} from "./slideParts";

const BAR_AREA = 132;
const MIN_BAR = 6;
const BARS_START = 500;
const BAR_STAGGER = 90;
const BAR_MS = 600;

const WeekdayBar = memo(function WeekdayBar({
  clock,
  index,
  fraction,
  peak,
  barColor,
  labelColor,
}: {
  clock: SharedValue<number>;
  index: number;
  /** 0..1 of the tallest bar. */
  fraction: number;
  peak: boolean;
  barColor: string;
  labelColor: string;
}) {
  const styles = useStyles();
  const start = BARS_START + index * BAR_STAGGER;
  const animated = useAnimatedStyle(() => ({
    height:
      MIN_BAR +
      (BAR_AREA - MIN_BAR) * fraction * easeOut(seg(clock.value, start, start + BAR_MS)),
  }));
  return (
    <View style={styles.column}>
      <View style={styles.barArea}>
        <Animated.View
          style={[styles.bar, { backgroundColor: barColor }, animated]}
        />
      </View>
      <SlideText
        style={[
          styles.dayLabel,
          { color: labelColor },
          peak && styles.dayLabelPeak,
        ]}
        maxFontSizeMultiplier={1}
      >
        {weekdayShort(index).slice(0, 1)}
      </SlideText>
    </View>
  );
});

/** Rhythm: the week as seven bars with the peak day lit, then the weekend share and calm days. */
export function RhythmSlide({ snapshot, copy, tone, clock }: SlideProps) {
  const styles = useStyles();
  const totals = snapshot.weekday.totals.map(parseAmount);
  const max = Math.max(0, ...totals);
  const peak = snapshot.weekday.peak_index;

  return (
    <SlideFrame
      tone={tone}
      accessibilityLabel={slideAccessibilityLabel("rhythm", snapshot, copy)}
    >
      <Reveal clock={clock} start={0}>
        <Kicker tone={tone}>{copy.rhythm.kicker}</Kicker>
      </Reveal>
      <Reveal clock={clock} start={150} pop>
        <SlideText
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[heroStyles.hero, { color: tone.text }]}
        >
          {`${weekdayName(peak)}s`}
        </SlideText>
      </Reveal>

      <View style={styles.bars}>
        {totals.map((total, index) => (
          <WeekdayBar
            key={index}
            clock={clock}
            index={index}
            fraction={max > 0 ? total / max : 0}
            peak={index === peak}
            barColor={index === peak ? tone.highlight : tone.panel}
            labelColor={index === peak ? tone.text : tone.textSoft}
          />
        ))}
      </View>

      <Reveal clock={clock} start={1500} style={styles.lines}>
        <SlideText style={[styles.line, { color: tone.text }]}>
          {copy.rhythm.line}
        </SlideText>
        <SlideText style={[styles.line, { color: tone.text }]}>
          {copy.rhythm.weekendLine}
        </SlideText>
      </Reveal>
      {copy.rhythm.calmLine ? (
        <Reveal clock={clock} start={2100} style={styles.calmWrap}>
          <View style={[styles.calm, { backgroundColor: tone.panel }]}>
            <SlideText style={[styles.calmText, { color: tone.text }]}>
              {copy.rhythm.calmLine}
            </SlideText>
          </View>
        </Reveal>
      ) : null}
    </SlideFrame>
  );
}

const useStyles = createThemedStyles(() => ({
  bars: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  column: {
    flex: 1,
    alignItems: "stretch",
    gap: spacing.xs,
  },
  barArea: {
    height: BAR_AREA,
    justifyContent: "flex-end",
  },
  bar: {
    borderRadius: radius.sm,
  },
  dayLabel: {
    textAlign: "center",
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  dayLabelPeak: {
    fontFamily: fontFamilies.bold,
  },
  lines: {
    marginTop: spacing.xl,
    gap: spacing.xs,
  },
  line: {
    fontFamily: fontFamilies.medium,
    fontSize: 18,
    lineHeight: 25,
  },
  calmWrap: {
    marginTop: spacing.lg,
  },
  calm: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  calmText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 21,
  },
}));

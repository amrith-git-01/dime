import { useEffect } from "react";
import { View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { tabularNums } from "@/constants/typography";
import { useCelebrationStore } from "@/stores/celebrationStore";
import { createThemedStyles } from "@/theme";

import { buildReportStats } from "../../utils/shareStats";
import { slideAccessibilityLabel } from "../../utils/slideAccessibility";
import {
  Kicker,
  Reveal,
  SlideFrame,
  SlideText,
  SupportLine,
  type SlideProps,
} from "./slideParts";

/** Room under the closing content for the Share / Done controls the player draws there. */
export const CLOSING_CONTROLS_HEIGHT = 168;
const BURST_AT_MS = 900;

/**
 * Closing: the title, three key stats and the tagline. The Share and Done buttons are drawn by the
 * player (outside the gesture area, so tapping them never turns the page).
 */
export function ClosingSlide({
  snapshot,
  copy,
  tone,
  clock,
  staticFrames,
}: SlideProps) {
  const styles = useStyles();
  const stats = buildReportStats(snapshot, true);

  useEffect(() => {
    if (staticFrames) {
      return;
    }
    const timer = setTimeout(() => {
      useCelebrationStore.getState().celebrate({ kind: "burst" });
    }, BURST_AT_MS);
    return () => clearTimeout(timer);
  }, [staticFrames]);

  return (
    <SlideFrame
      tone={tone}
      accessibilityLabel={slideAccessibilityLabel("closing", snapshot, copy)}
      extraBottom={CLOSING_CONTROLS_HEIGHT - 40}
    >
      <Reveal clock={clock} start={0}>
        <Kicker tone={tone}>{copy.closing.kicker}</Kicker>
      </Reveal>
      <Reveal clock={clock} start={150} pop>
        <SlideText
          numberOfLines={3}
          adjustsFontSizeToFit
          style={[styles.title, { color: tone.highlight }]}
        >
          {copy.title.name}
        </SlideText>
      </Reveal>
      <Reveal clock={clock} start={700}>
        <SupportLine tone={tone}>{copy.title.tagline}</SupportLine>
      </Reveal>

      <View style={styles.stats}>
        {stats.map((stat, index) => (
          <Reveal
            key={stat.label}
            clock={clock}
            start={1100 + index * 160}
            dy={12}
            style={styles.statWrap}
          >
            <View style={[styles.stat, { backgroundColor: tone.panel }]}>
              <SlideText
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[styles.statValue, { color: tone.text }]}
              >
                {stat.value}
              </SlideText>
              <SlideText
                numberOfLines={2}
                style={[styles.statLabel, { color: tone.textSoft }]}
              >
                {stat.label}
              </SlideText>
            </View>
          </Reveal>
        ))}
      </View>
    </SlideFrame>
  );
}

const useStyles = createThemedStyles(() => ({
  title: {
    fontFamily: fontFamilies.bold,
    fontSize: 52,
    lineHeight: 58,
    letterSpacing: -1.5,
  },
  stats: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  statWrap: {
    flex: 1,
  },
  stat: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
    minHeight: 92,
  },
  statValue: {
    fontFamily: fontFamilies.bold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
    fontVariant: tabularNums,
  },
  statLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 17,
  },
}));

import { useEffect } from "react";

import { fontFamilies } from "@/constants/fonts";
import { spacing } from "@/constants/spacing";
import { createThemedStyles } from "@/theme";
import { useCelebrationStore } from "@/stores/celebrationStore";

import { formatReportAmount, parseAmount } from "../../utils/reportFormat";
import { slideAccessibilityLabel } from "../../utils/slideAccessibility";
import {
  CountText,
  heroStyles,
  Kicker,
  Reveal,
  SlideFrame,
  SlideText,
  SupportLine,
  type SlideProps,
} from "./slideParts";

/** When the confetti pops, after the hero number has landed. */
const CONFETTI_AT_MS = 900;

/** Win: the one good thing of the month, told by kind. Confetti, unless motion is off. */
export function WinSlide({
  snapshot,
  copy,
  tone,
  clock,
  initialMs,
  staticFrames,
}: SlideProps) {
  const styles = useStyles();
  const { win } = snapshot;

  // The celebration store already applies reduced motion and the Celebrations preference; the
  // static-frames case (screen reader) skips it too.
  useEffect(() => {
    if (staticFrames || win.kind === "none") {
      return;
    }
    const timer = setTimeout(() => {
      useCelebrationStore.getState().celebrate({ kind: "confettiMedium" });
    }, CONFETTI_AT_MS);
    return () => clearTimeout(timer);
  }, [staticFrames, win.kind]);

  if (!copy.win || win.kind === "none") {
    return null;
  }

  const hero =
    win.kind === "category_down"
      ? {
          to: parseAmount(win.delta),
          format: formatReportAmount,
          unit: "less than usual",
        }
      : win.kind === "no_spend_streak"
        ? {
            to: win.days,
            format: (n: number) => `${n}`,
            unit: win.days === 1 ? "day, not a rupee" : "days, not a rupee",
          }
        : {
            to: parseAmount(win.spent),
            format: formatReportAmount,
            unit: "your lightest month",
          };

  return (
    <SlideFrame
      tone={tone}
      accessibilityLabel={slideAccessibilityLabel("win", snapshot, copy)}
    >
      <Reveal clock={clock} start={0}>
        <Kicker tone={tone}>{copy.win.kicker}</Kicker>
      </Reveal>
      <Reveal clock={clock} start={150} ms={300} dy={0}>
        <CountText
          clock={clock}
          initialMs={initialMs}
          to={hero.to}
          format={hero.format}
          style={[heroStyles.hero, { color: tone.text }]}
        />
      </Reveal>
      <Reveal clock={clock} start={1300}>
        <SlideText style={[styles.unit, { color: tone.textSoft }]}>
          {hero.unit}
        </SlideText>
      </Reveal>
      <Reveal clock={clock} start={1700}>
        <SupportLine tone={tone}>{copy.win.line}</SupportLine>
      </Reveal>
    </SlideFrame>
  );
}

const useStyles = createThemedStyles(() => ({
  unit: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 22,
    lineHeight: 28,
    marginTop: spacing.xs,
  },
}));

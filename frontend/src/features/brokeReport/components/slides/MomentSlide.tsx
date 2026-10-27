import { View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { tabularNums } from "@/constants/typography";
import { createThemedStyles } from "@/theme";

import {
  formatReportAmount,
  parseAmount,
} from "../../utils/reportFormat";
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

/**
 * Moment: the single biggest spend as the hero, with the busiest day under it. Either half can be
 * missing; when the biggest spend is, the busiest day becomes the hero.
 */
export function MomentSlide({ snapshot, copy, tone, clock, initialMs }: SlideProps) {
  const styles = useStyles();
  const { biggest_spend: biggest, busiest_day: busiest } = snapshot;
  const { biggest: biggestCopy, busiest: busiestCopy } = copy.moment;

  const hero = biggest && biggestCopy
    ? {
        kicker: biggestCopy.kicker,
        amount: parseAmount(biggest.amount),
        line: biggestCopy.line,
      }
    : busiest && busiestCopy
      ? {
          kicker: busiestCopy.kicker,
          amount: parseAmount(busiest.amount),
          line: busiestCopy.line,
        }
      : null;
  if (!hero) {
    return null;
  }
  const showBusiestCard = Boolean(biggest && biggestCopy && busiest && busiestCopy);

  return (
    <SlideFrame
      tone={tone}
      accessibilityLabel={slideAccessibilityLabel("moment", snapshot, copy)}
    >
      <Reveal clock={clock} start={0}>
        <Kicker tone={tone}>{hero.kicker}</Kicker>
      </Reveal>
      <Reveal clock={clock} start={150} ms={300} dy={0}>
        <CountText
          clock={clock}
          initialMs={initialMs}
          to={hero.amount}
          format={formatReportAmount}
          style={[heroStyles.hero, { color: tone.text }]}
        />
      </Reveal>
      <Reveal clock={clock} start={1300}>
        <SupportLine tone={tone}>{hero.line}</SupportLine>
      </Reveal>

      {showBusiestCard && busiest && busiestCopy ? (
        <Reveal clock={clock} start={2100} style={styles.cardWrap}>
          <View style={[styles.card, { backgroundColor: tone.panel }]}>
            <SlideText style={[styles.cardKicker, { color: tone.textSoft }]}>
              {busiestCopy.kicker}
            </SlideText>
            <SlideText style={[styles.cardAmount, { color: tone.text }]}>
              {formatReportAmount(busiest.amount)}
            </SlideText>
            <SlideText style={[styles.cardLine, { color: tone.text }]}>
              {busiestCopy.line}
            </SlideText>
          </View>
        </Reveal>
      ) : null}
    </SlideFrame>
  );
}

const useStyles = createThemedStyles(() => ({
  cardWrap: {
    marginTop: spacing.xl,
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cardKicker: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  cardAmount: {
    fontFamily: fontFamilies.bold,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.8,
    fontVariant: tabularNums,
  },
  cardLine: {
    fontFamily: fontFamilies.medium,
    fontSize: 16,
    lineHeight: 22,
  },
}));

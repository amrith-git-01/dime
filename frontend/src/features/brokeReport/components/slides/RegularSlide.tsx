import { View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { spacing } from "@/constants/spacing";
import { createThemedStyles } from "@/theme";

import { formatReportAmount } from "../../utils/reportFormat";
import { slideAccessibilityLabel } from "../../utils/slideAccessibility";
import {
  Chip,
  CountText,
  heroStyles,
  Kicker,
  Reveal,
  SlideFrame,
  SlideText,
  SupportLine,
  type SlideProps,
} from "./slideParts";

/** Regular: the place you went back to most. */
export function RegularSlide({ snapshot, copy, tone, clock, initialMs }: SlideProps) {
  const styles = useStyles();
  const payee = snapshot.top_payee;
  if (!payee || !copy.regular) {
    return null;
  }
  return (
    <SlideFrame
      tone={tone}
      accessibilityLabel={slideAccessibilityLabel("regular", snapshot, copy)}
    >
      <Reveal clock={clock} start={0}>
        <Kicker tone={tone}>{copy.regular.kicker}</Kicker>
      </Reveal>

      <View style={styles.heroRow}>
        <CountText
          clock={clock}
          initialMs={initialMs}
          to={payee.count}
          start={150}
          end={1000}
          format={(n) => `${n}`}
          fit={false}
          style={[heroStyles.hero, { color: tone.text }]}
        />
        <Reveal clock={clock} start={500}>
          <SlideText style={[styles.unit, { color: tone.textSoft }]}>
            {payee.count === 1 ? "visit" : "visits"}
          </SlideText>
        </Reveal>
      </View>

      <Reveal clock={clock} start={900}>
        <SlideText
          numberOfLines={2}
          adjustsFontSizeToFit
          style={[styles.name, { color: tone.text }]}
        >
          {payee.display_name}
        </SlideText>
      </Reveal>

      <Reveal clock={clock} start={1300}>
        <SupportLine tone={tone}>{copy.regular.line}</SupportLine>
      </Reveal>

      <Reveal clock={clock} start={1700} pop style={styles.chipWrap}>
        <Chip tone={tone}>{`${formatReportAmount(payee.amount)} in total`}</Chip>
      </Reveal>
    </SlideFrame>
  );
}

const useStyles = createThemedStyles(() => ({
  heroRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.md,
  },
  unit: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 28,
    lineHeight: 34,
  },
  name: {
    marginTop: spacing.sm,
    fontFamily: fontFamilies.bold,
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -0.8,
  },
  chipWrap: {
    alignSelf: "flex-start",
  },
}));

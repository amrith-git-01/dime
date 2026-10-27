import { View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { createThemedStyles } from "@/theme";

import { monthName } from "../../utils/reportFormat";
import { slideAccessibilityLabel } from "../../utils/slideAccessibility";
import {
  Chip,
  heroStyles,
  Kicker,
  Reveal,
  SlideFrame,
  SlideText,
  SupportLine,
  type SlideProps,
} from "./slideParts";

/** Cover: the month in giant type, then the title this month earned. */
export function CoverSlide({
  snapshot,
  copy,
  tone,
  clock,
  isSample = false,
}: SlideProps) {
  const styles = useStyles();
  return (
    <SlideFrame
      tone={tone}
      accessibilityLabel={slideAccessibilityLabel("cover", snapshot, copy)}
    >
      {/* A big faint rupee sign as the only decoration: a text glyph, so it costs nothing. */}
      <SlideText
        style={[styles.watermark, { color: tone.panel }]}
        maxFontSizeMultiplier={1}
      >
        ₹
      </SlideText>

      {isSample ? (
        <Reveal clock={clock} start={0}>
          <Chip tone={tone} filled>
            SAMPLE REPORT
          </Chip>
        </Reveal>
      ) : null}

      <Reveal clock={clock} start={isSample ? 100 : 0} style={styles.block}>
        <Kicker tone={tone}>{copy.cover.kicker}</Kicker>
      </Reveal>

      <Reveal clock={clock} start={250} pop>
        <SlideText
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[heroStyles.hero, { color: tone.text }]}
        >
          {monthName(snapshot.month)}
        </SlideText>
        <SlideText style={[styles.year, { color: tone.textSoft }]}>
          {snapshot.year}
        </SlideText>
      </Reveal>

      <Reveal clock={clock} start={900} style={styles.block}>
        <View style={[styles.titleCard, { backgroundColor: tone.highlight }]}>
          <SlideText style={[styles.titleName, { color: tone.onHighlight }]}>
            {copy.title.name}
          </SlideText>
        </View>
        <SupportLine tone={tone}>{copy.title.tagline}</SupportLine>
      </Reveal>

      {copy.sparseNote ? (
        <Reveal clock={clock} start={1400}>
          <SlideText style={[styles.note, { color: tone.textSoft }]}>
            {copy.sparseNote}
          </SlideText>
        </Reveal>
      ) : (
        <Reveal clock={clock} start={1400}>
          <SlideText style={[styles.note, { color: tone.textSoft }]}>
            {copy.cover.line}
          </SlideText>
        </Reveal>
      )}
    </SlideFrame>
  );
}

const useStyles = createThemedStyles(() => ({
  watermark: {
    position: "absolute",
    right: -24,
    bottom: 40,
    fontFamily: fontFamilies.bold,
    fontSize: 340,
    lineHeight: 360,
  },
  block: {
    marginTop: spacing.lg,
  },
  year: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: 1,
  },
  titleCard: {
    alignSelf: "flex-start",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
  },
  titleName: {
    fontFamily: fontFamilies.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
  },
  note: {
    fontFamily: fontFamilies.medium,
    fontSize: 16,
    lineHeight: 22,
    marginTop: spacing.xl,
  },
}));

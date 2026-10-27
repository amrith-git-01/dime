import { ArrowDown, ArrowUp, Equal } from "lucide-react-native";

import { spacing } from "@/constants/spacing";
import { createThemedStyles, useTheme } from "@/theme";

import { formatReportAmount, parseAmount } from "../../utils/reportFormat";
import { slideAccessibilityLabel } from "../../utils/slideAccessibility";
import {
  Chip,
  CountText,
  heroStyles,
  Kicker,
  Reveal,
  SlideFrame,
  SupportLine,
  type SlideProps,
} from "./slideParts";

const CHIP_ICON_SIZE = 18;

/** Damage: what the month cost, and how that sits against a usual month. */
export function DamageSlide({ snapshot, copy, tone, clock, initialMs }: SlideProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { chip, chipDirection } = copy.damage;
  const Icon =
    chipDirection === "up" ? ArrowUp : chipDirection === "down" ? ArrowDown : Equal;

  return (
    <SlideFrame
      tone={tone}
      accessibilityLabel={slideAccessibilityLabel("damage", snapshot, copy)}
    >
      <Reveal clock={clock} start={0}>
        <Kicker tone={tone}>{copy.damage.kicker}</Kicker>
      </Reveal>

      <Reveal clock={clock} start={150} ms={300} dy={0}>
        <CountText
          clock={clock}
          initialMs={initialMs}
          to={parseAmount(snapshot.spent)}
          format={formatReportAmount}
          style={[heroStyles.hero, { color: tone.text }]}
        />
      </Reveal>

      <Reveal clock={clock} start={1300}>
        <SupportLine tone={tone}>{copy.damage.line}</SupportLine>
      </Reveal>

      {chip ? (
        <Reveal clock={clock} start={1700} pop style={styles.chipWrap}>
          <Chip
            tone={tone}
            filled
            fillTone={chipDirection === "down" ? colors.report.mint : undefined}
            icon={
              <Icon
                size={CHIP_ICON_SIZE}
                color={tone.onHighlight}
                strokeWidth={2.5}
              />
            }
          >
            {chip}
          </Chip>
        </Reveal>
      ) : null}
    </SlideFrame>
  );
}

const useStyles = createThemedStyles(() => ({
  chipWrap: {
    alignSelf: "flex-start",
    marginTop: spacing.xs,
  },
}));

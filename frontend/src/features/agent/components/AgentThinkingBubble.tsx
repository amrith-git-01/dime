import { memo } from "react";
import {
  ActivityIndicator,
  Text,
  View,
} from "react-native";

import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { createThemedStyles, useTheme } from "@/theme";

const DEFAULT_LABEL = "Thinking";

type AgentThinkingBubbleProps = {
  /** Real progress from the server (`step` events); a neutral label until the first one. */
  label?: string | null;
};

export const AgentThinkingBubble = memo(function AgentThinkingBubble({
  label,
}: AgentThinkingBubbleProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.bubbleWrap}>
      <View style={styles.bubble} accessibilityLiveRegion="polite">
        <ActivityIndicator size="small" color={colors.accentText} />
        <Text style={styles.word}>{label || DEFAULT_LABEL}</Text>
      </View>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  bubbleWrap: {
    alignSelf: "flex-start",
    marginBottom: spacing.md,
    maxWidth: "92%",
  },
  bubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    ...shadows.card,
    minHeight: 44,
  },
  word: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkSoft,
    letterSpacing: 0.2,
  },
}));

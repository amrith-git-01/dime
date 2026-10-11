import { memo } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { accent, inkSoft, radius, shadow, spacing, surface } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

const DEFAULT_LABEL = "Thinking";

type AgentThinkingBubbleProps = {
  /** Real progress from the server (`step` events); a neutral label until the first one. */
  label?: string | null;
};

export const AgentThinkingBubble = memo(function AgentThinkingBubble({
  label,
}: AgentThinkingBubbleProps) {
  return (
    <View style={styles.bubbleWrap}>
      <View style={styles.bubble} accessibilityLiveRegion="polite">
        <ActivityIndicator size="small" color={accent} />
        <Text style={styles.word}>{label || DEFAULT_LABEL}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
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
    backgroundColor: surface,
    ...Platform.select({
      android: { elevation: 2 },
      default: {
        shadowColor: shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
    }),
    minHeight: 44,
  },
  word: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 22,
    color: inkSoft,
    letterSpacing: 0.2,
  },
});

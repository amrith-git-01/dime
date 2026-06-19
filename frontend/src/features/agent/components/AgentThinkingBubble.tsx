import { memo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import {
  AGENT_SPINNER_INTERVAL_MS,
  AGENT_SPINNER_WORDS,
} from "@/features/agent/constants/loadingPhrases";
import { useRotatingPhrase } from "@/features/agent/hooks/useRotatingPhrase";

type AgentThinkingBubbleProps = {
  active: boolean;
};

export const AgentThinkingBubble = memo(function AgentThinkingBubble({
  active,
}: AgentThinkingBubbleProps) {
  const word = useRotatingPhrase(
    AGENT_SPINNER_WORDS,
    active,
    AGENT_SPINNER_INTERVAL_MS,
  );

  if (!active) {
    return null;
  }

  return (
    <View style={styles.bubbleWrap}>
      <View style={styles.bubble} accessibilityLiveRegion="polite">
        <ActivityIndicator size="small" color={colors.headerGradientStart} />
        <Text style={styles.word}>{word}</Text>
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
    backgroundColor: colors.barBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    minHeight: 44,
  },
  word: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 22,
    color: colors.headerGradientStart,
    letterSpacing: 0.2,
  },
});

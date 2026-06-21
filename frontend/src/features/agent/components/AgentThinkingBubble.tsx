import { memo } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";

import { accent, inkSoft, radius, shadow, spacing, surface } from "@/constants";
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
        <ActivityIndicator size="small" color={accent} />
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

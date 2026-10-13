import { ThumbsDown, ThumbsUp } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { spacing } from "@/constants";

import type { AgentFeedbackRating } from "../types";
import { useTheme } from "@/theme";

type AgentFeedbackButtonsProps = {
  messageId: string;
  /** The recorded vote; once set, the row is locked (one vote per message). */
  feedback: AgentFeedbackRating | null;
  onFeedback: (messageId: string, rating: AgentFeedbackRating) => void;
};

const OPTIONS = [
  { rating: "up", label: "Good answer", Icon: ThumbsUp },
  { rating: "down", label: "Bad answer", Icon: ThumbsDown },
] as const;

/** Thumbs up / down under a completed assistant answer. */
export const AgentFeedbackButtons = memo(function AgentFeedbackButtons({
  messageId,
  feedback,
  onFeedback,
}: AgentFeedbackButtonsProps) {
  const { colors } = useTheme();
  const voted = feedback !== null;
  return (
    <View style={styles.row}>
      {OPTIONS.map(({ rating, label, Icon }) => {
        const selected = feedback === rating;
        return (
          <Pressable
            key={rating}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected, disabled: voted }}
            disabled={voted}
            onPress={() => onFeedback(messageId, rating)}
            hitSlop={8}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              voted && !selected && styles.buttonDimmed,
            ]}
          >
            <Icon
              size={16}
              color={selected ? colors.accentText : colors.inkFaint}
              strokeWidth={2}
              fill={selected ? colors.accentText : "none"}
            />
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  button: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonDimmed: {
    opacity: 0.4,
  },
});

import { SendHorizontal } from "lucide-react-native";
import { memo, useState } from "react";
import {
  ActivityIndicator,
  Text,
  Pressable,
  TextInput,
  View,
} from "react-native";

import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { tourTargetIds } from "@/constants/tourTargetIds";
import { useTourTarget } from "@/hooks/useTourTarget";
import {
  createThemedStyles,
  useTheme,
  useThemedTextInputProps,
} from "@/theme";

type AgentChatComposerProps = {
  /** True while a reply is pending: the field and send button are locked. */
  disabled: boolean;
  /** Today's question allowance is used up: locks the field with an explanatory placeholder. */
  limitReached?: boolean;
  /** Allowance line above the input, e.g. "3 of 5 questions left today". */
  caption?: string;
  /** Receives the trimmed message; the composer clears its own draft. */
  onSend: (text: string) => void;
  /** Bump to clear the draft from outside (e.g. when the chat is reset). */
  resetToken: number;
};

/**
 * Message input. It owns the draft so typing re-renders only this row, not the animated
 * overlay around it.
 */
export const AgentChatComposer = memo(function AgentChatComposer({
  disabled,
  limitReached = false,
  caption = "",
  onSend,
  resetToken,
}: AgentChatComposerProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const inputProps = useThemedTextInputProps();
  const tourTarget = useTourTarget(tourTargetIds.agentComposer);
  const [draft, setDraft] = useState("");
  const [seenResetToken, setSeenResetToken] = useState(resetToken);

  if (seenResetToken !== resetToken) {
    setSeenResetToken(resetToken);
    setDraft("");
  }

  const locked = disabled || limitReached;
  const canSend = !locked && draft.trim().length > 0;

  const handleSend = () => {
    const text = draft.trim();
    if (!text || locked) {
      return;
    }
    setDraft("");
    onSend(text);
  };

  return (
    <View {...tourTarget} style={styles.wrap}>
      {caption ? (
        <Text style={styles.caption} numberOfLines={2}>
          {caption}
        </Text>
      ) : null}
      <View style={styles.composer}>
        <TextInput
          {...inputProps}
          value={draft}
          onChangeText={setDraft}
          placeholder={
            limitReached
              ? "Daily limit reached. Try again tomorrow."
              : "Ask a question…"
          }
          style={styles.input}
          multiline
          maxLength={4000}
          editable={!locked}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          disabled={!canSend}
          onPress={handleSend}
          style={({ pressed }) => [
            styles.sendButton,
            !canSend && styles.sendButtonDisabled,
            pressed && !disabled && styles.sendButtonPressed,
          ]}
        >
          {disabled ? (
            <ActivityIndicator size="small" color={colors.onAccent} />
          ) : (
            <SendHorizontal size={20} color={colors.onAccent} strokeWidth={2} />
          )}
        </Pressable>
      </View>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  wrap: {
    backgroundColor: colors.surface,
  },
  caption: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSunken,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    color: colors.ink,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
  sendButtonPressed: {
    opacity: 0.85,
  },
}));

import { SendHorizontal } from "lucide-react-native";
import { memo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import {
  accent,
  ink,
  inkFaint,
  radius,
  spacing,
  surface,
  surfaceSunken,
} from "@/constants";
import { fontFamilies } from "@/constants/fonts";

type AgentChatComposerProps = {
  /** True while a reply is pending: the field and send button are locked. */
  disabled: boolean;
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
  onSend,
  resetToken,
}: AgentChatComposerProps) {
  const [draft, setDraft] = useState("");
  const [seenResetToken, setSeenResetToken] = useState(resetToken);

  if (seenResetToken !== resetToken) {
    setSeenResetToken(resetToken);
    setDraft("");
  }

  const canSend = !disabled && draft.trim().length > 0;

  const handleSend = () => {
    const text = draft.trim();
    if (!text || disabled) {
      return;
    }
    setDraft("");
    onSend(text);
  };

  return (
    <View style={styles.composer}>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="Ask a question…"
        placeholderTextColor={inkFaint}
        style={styles.input}
        multiline
        maxLength={4000}
        editable={!disabled}
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
          <ActivityIndicator size="small" color={surface} />
        ) : (
          <SendHorizontal size={20} color={surface} strokeWidth={2} />
        )}
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: surface,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: radius.full,
    backgroundColor: surfaceSunken,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    color: ink,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
  sendButtonPressed: {
    opacity: 0.85,
  },
});

import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  BentoEditorFooter,
  BENTO_FORM_BODY_GAP,
  BENTO_FORM_SECTION_PADDING,
} from "@/components/bento";
import { TwoToneCard } from "@/components/shared";
import { TextField } from "@/components/ui";
import { bento, colors } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

const MAX_MESSAGE_LENGTH = 1000;

export type SettingsFeedbackEditorProps = {
  message: string;
  onMessageChange: (text: string) => void;
  onClear: () => void;
  onSend: () => void;
  sendDisabled: boolean;
};

export const SettingsFeedbackEditor = memo(function SettingsFeedbackEditor({
  message,
  onMessageChange,
  onClear,
  onSend,
  sendDisabled,
}: SettingsFeedbackEditorProps) {
  const charCount = `${message.length}/${MAX_MESSAGE_LENGTH}`;

  return (
    <TwoToneCard
      header={
        <View style={styles.headerInner}>
          <Text style={styles.kicker}>Send feedback</Text>
          <Text style={styles.subtitle}>
            Tell us what’s working, what’s confusing, or what you’d like next.
          </Text>
        </View>
      }
      body={
        <View style={styles.bodyInner}>
          <TextField
            label="Message"
            labelRight={<Text style={styles.charCount}>{charCount}</Text>}
            placeholder="Share your thoughts…"
            value={message}
            onChangeText={onMessageChange}
            maxLength={MAX_MESSAGE_LENGTH}
            multiline
            textAlignVertical="top"
          />

          <BentoEditorFooter
            onClear={onClear}
            onSave={onSend}
            saveTitle="Send"
            saveDisabled={sendDisabled}
          />
        </View>
      }
    />
  );
});

const styles = StyleSheet.create({
  headerInner: {
    padding: BENTO_FORM_SECTION_PADDING,
    gap: BENTO_FORM_BODY_GAP / 2,
  },
  kicker: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: bento.onPastel.primary,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: bento.onPastel.muted,
  },
  bodyInner: {
    padding: BENTO_FORM_SECTION_PADDING,
    gap: BENTO_FORM_BODY_GAP,
  },
  charCount: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
  },
});

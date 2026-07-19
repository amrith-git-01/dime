import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { TextField } from "@/components/ui";
import { fontFamilies, formStyles, inkSoft } from "@/constants";

import type { FeedbackType } from "../types";
import { FeedbackTypeSegmentedControl } from "./FeedbackTypeSegmentedControl";
import { SettingsEditorFooter } from "./SettingsEditorFooter";
import { SettingsFormCard } from "./SettingsFormCard";

const MAX_MESSAGE_LENGTH = 1000;

export type SettingsFeedbackEditorProps = {
  feedbackType: FeedbackType;
  onFeedbackTypeChange: (type: FeedbackType) => void;
  message: string;
  onMessageChange: (text: string) => void;
  onClear: () => void;
  onSend: () => void;
  sendDisabled: boolean;
  sendLoading?: boolean;
};

export const SettingsFeedbackEditor = memo(function SettingsFeedbackEditor({
  feedbackType,
  onFeedbackTypeChange,
  message,
  onMessageChange,
  onClear,
  onSend,
  sendDisabled,
  sendLoading = false,
}: SettingsFeedbackEditorProps) {
  const charCount = `${message.length}/${MAX_MESSAGE_LENGTH}`;

  return (
    <SettingsFormCard>
      <View>
        <Text style={formStyles.fieldLabel}>Type</Text>
        <FeedbackTypeSegmentedControl
          value={feedbackType}
          onChange={onFeedbackTypeChange}
          disabled={sendLoading}
        />
      </View>

      <TextField
        label="Message"
        labelRight={<Text style={styles.charCount}>{charCount}</Text>}
        placeholder="Share your thoughts…"
        value={message}
        onChangeText={onMessageChange}
        maxLength={MAX_MESSAGE_LENGTH}
        multiline
        minInputHeight={140}
        showClear={false}
      />

      <SettingsEditorFooter
        onClear={onClear}
        onSave={onSend}
        saveTitle="Send"
        saveDisabled={sendDisabled}
        saveLoading={sendLoading}
        clearDisabled={sendLoading}
      />
    </SettingsFormCard>
  );
});

const styles = StyleSheet.create({
  charCount: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: inkSoft,
  },
});

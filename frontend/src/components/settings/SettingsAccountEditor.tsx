import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BentoEditorFooter } from "@/components/bento/BentoEditorFooter";
import {
  BENTO_FORM_BODY_GAP,
  BENTO_FORM_SECTION_PADDING,
} from "@/components/bento/bentoFormTokens";
import { ProfileAvatarEditor } from "@/components/profile/ProfileAvatarEditor";
import { TwoToneCard } from "@/components/shared";
import { TextField } from "@/components/ui/TextField/TextField";
import { bento } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import {
  SETTINGS_ACCOUNT_AVATAR_SIZE,
  SETTINGS_ACCOUNT_REFRESH_FAB_SIZE,
  SETTINGS_ACCOUNT_REFRESH_ICON_SIZE,
} from "./settingsBentoTokens";

export type SettingsAccountEditorProps = {
  previewAvatarUrl: string;
  username: string;
  onUsernameChange: (text: string) => void;
  avatarBusy?: boolean;
  onRefreshRandomAvatar: () => void;
  saveLoading: boolean;
  saveDisabled: boolean;
  onClear: () => void;
  onSave: () => void;
};

export const SettingsAccountEditor = memo(function SettingsAccountEditor({
  previewAvatarUrl,
  username,
  onUsernameChange,
  avatarBusy = false,
  onRefreshRandomAvatar,
  saveLoading,
  saveDisabled,
  onClear,
  onSave,
}: SettingsAccountEditorProps) {
  return (
    <TwoToneCard
      header={
        <View style={styles.headerInner}>
          <Text style={styles.headerTitle}>Profile</Text>
          <ProfileAvatarEditor
            avatarUrl={previewAvatarUrl}
            avatarSize={SETTINGS_ACCOUNT_AVATAR_SIZE}
            refreshFabSize={SETTINGS_ACCOUNT_REFRESH_FAB_SIZE}
            refreshIconSize={SETTINGS_ACCOUNT_REFRESH_ICON_SIZE}
            disabled={avatarBusy || saveLoading}
            onRefreshRandom={onRefreshRandomAvatar}
          />
        </View>
      }
      body={
        <View style={styles.bodyInner}>
          <TextField
            label="Display name"
            placeholder="How you appear in the app"
            value={username}
            onChangeText={onUsernameChange}
            maxLength={40}
            autoCapitalize="words"
            editable={!avatarBusy && !saveLoading}
          />

          <BentoEditorFooter
            onClear={onClear}
            onSave={onSave}
            saveTitle="Update"
            saveLoading={saveLoading}
            saveDisabled={saveDisabled}
            clearDisabled={avatarBusy || saveLoading}
          />
        </View>
      }
    />
  );
});

const styles = StyleSheet.create({
  headerInner: {
    padding: BENTO_FORM_SECTION_PADDING,
    gap: BENTO_FORM_BODY_GAP,
    alignItems: "center",
    overflow: "visible",
  },
  headerTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: bento.onPastel.primary,
    alignSelf: "flex-start",
  },
  bodyInner: {
    padding: BENTO_FORM_SECTION_PADDING,
    gap: BENTO_FORM_BODY_GAP,
  },
});

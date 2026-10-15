import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { ProfileAvatarEditor } from "@/components/profile/ProfileAvatarEditor";
import { TextField } from "@/components/ui";

import {
  SETTINGS_ACCOUNT_AVATAR_SIZE,
  SETTINGS_ACCOUNT_REFRESH_FAB_SIZE,
  SETTINGS_ACCOUNT_REFRESH_ICON_SIZE,
} from "../constants/settingsTokens";
import { BentoEditorFooter } from "@/components/bento";
import { SettingsFormCard } from "./SettingsFormCard";

export type SettingsAccountEditorProps = {
  previewAvatarUrl: string;
  username: string;
  email: string;
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
  email,
  onUsernameChange,
  avatarBusy = false,
  onRefreshRandomAvatar,
  saveLoading,
  saveDisabled,
  onClear,
  onSave,
}: SettingsAccountEditorProps) {
  return (
    <SettingsFormCard
      header={
        <View style={styles.headerInner}>
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
    >
      <TextField
        label="Display name"
        placeholder="How you appear in the app"
        value={username}
        onChangeText={onUsernameChange}
        maxLength={20}
        autoCapitalize="words"
        editable={!avatarBusy && !saveLoading}
      />

      <TextField label="Email" value={email} editable={false} />

      <BentoEditorFooter
        onClear={onClear}
        onSave={onSave}
        saveTitle="Update"
        saveLoading={saveLoading}
        saveDisabled={saveDisabled}
        clearDisabled={avatarBusy || saveLoading}
      />
    </SettingsFormCard>
  );
});

const styles = StyleSheet.create({
  headerInner: {
    alignItems: "center",
    overflow: "visible",
  },
});

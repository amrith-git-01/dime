import { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  BENTO_FORM_BODY_GAP,
  BENTO_FORM_SECTION_PADDING,
} from "@/components/bento/bentoFormTokens";
import { ProfileAvatarEditor } from "@/components/profile/ProfileAvatarEditor";
import { TwoToneCard } from "@/components/shared/TwoToneCard";
import { Button } from "@/components/ui/Button/Button";
import { TextField } from "@/components/ui/TextField/TextField";
import { fontFamilies } from "@/constants/fonts";
import { bento, colors } from "@/constants/theme";
import type { UsernameValidation } from "@/hooks/useProfileSetup";

import {
  PROFILE_SETUP_AVATAR_SIZE,
  PROFILE_SETUP_REFRESH_FAB_SIZE,
  PROFILE_SETUP_REFRESH_ICON_SIZE,
} from "./profileBentoTokens";

export type ProfileSetupEditorProps = {
  avatarUrl: string;
  username: string;
  validation: UsernameValidation;
  fieldError: string | null;
  disabled?: boolean;
  continueLoading?: boolean;
  continueDisabled?: boolean;
  onUsernameChange: (text: string) => void;
  onRefreshRandom: () => void;
  onContinue: () => void;
};

export const ProfileSetupEditor = memo(function ProfileSetupEditor({
  avatarUrl,
  username,
  validation,
  fieldError,
  disabled = false,
  continueLoading = false,
  continueDisabled = false,
  onUsernameChange,
  onRefreshRandom,
  onContinue,
}: ProfileSetupEditorProps) {
  const usernameCountLabel = useMemo(
    () => <Text style={styles.charCount}>{username.trim().length}/20</Text>,
    [username],
  );

  return (
    <TwoToneCard
      header={
        <View style={styles.headerInner}>
          <Text style={styles.headerTitle}>Almost there</Text>
          <Text style={styles.headerSubtitle}>
            Pick a generated avatar and a username.
          </Text>
          <ProfileAvatarEditor
            avatarUrl={avatarUrl}
            avatarSize={PROFILE_SETUP_AVATAR_SIZE}
            refreshFabSize={PROFILE_SETUP_REFRESH_FAB_SIZE}
            refreshIconSize={PROFILE_SETUP_REFRESH_ICON_SIZE}
            disabled={disabled}
            onRefreshRandom={onRefreshRandom}
          />
        </View>
      }
      body={
        <View style={styles.bodyInner}>
          <View style={styles.usernameBlock}>
            <TextField
              label="Username"
              labelRight={usernameCountLabel}
              value={username}
              onChangeText={onUsernameChange}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!disabled}
              showClear
              errorMessage={fieldError}
            />
            {!fieldError ? <ValidationHint validation={validation} /> : null}
          </View>
          <Button
            title="Continue"
            loading={continueLoading}
            disabled={continueDisabled || disabled}
            onPress={onContinue}
          />
        </View>
      }
    />
  );
});

const ValidationHint = memo(function ValidationHint({
  validation,
}: {
  validation: UsernameValidation;
}) {
  return (
    <Text
      style={[
        styles.hint,
        validation.isValid ? styles.hintOk : styles.hintMuted,
      ]}
    >
      {validation.message}
    </Text>
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
  headerSubtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: bento.onPastel.muted,
    alignSelf: "flex-start",
  },
  bodyInner: {
    padding: BENTO_FORM_SECTION_PADDING,
    gap: BENTO_FORM_BODY_GAP,
  },
  usernameBlock: {
    gap: 4,
  },
  charCount: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  hint: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  hintMuted: {
    color: colors.textSecondary,
  },
  hintOk: {
    color: colors.primary,
  },
});

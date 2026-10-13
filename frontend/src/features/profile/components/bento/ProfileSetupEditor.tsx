import { memo, useMemo } from "react";
import { Text, View } from "react-native";

import {
  BENTO_FORM_BODY_GAP,
  BENTO_FORM_SECTION_PADDING,
} from "@/components/bento";
import { ProfileAvatarEditor } from "@/components/profile/ProfileAvatarEditor";
import { TwoToneCard } from "@/components/shared";
import { Button, TextField } from "@/components/ui";
import { spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import type { UsernameValidation } from "@/hooks/useProfileSetup";

import {
  PROFILE_SETUP_AVATAR_SIZE,
  PROFILE_SETUP_REFRESH_FAB_SIZE,
  PROFILE_SETUP_REFRESH_ICON_SIZE,
} from "./profileBentoTokens";
import { createThemedStyles } from "@/theme";

export type ProfileSetupEditorProps = {
  avatarUrl: string;
  username: string;
  validation: UsernameValidation;
  fieldError: string | null;
  disabled?: boolean;
  continueLoading?: boolean;
  continueDisabled?: boolean;
  signOutLoading?: boolean;
  signOutDisabled?: boolean;
  onUsernameChange: (text: string) => void;
  onRefreshRandom: () => void;
  onContinue: () => void;
  onSignOut: () => void;
};

export const ProfileSetupEditor = memo(function ProfileSetupEditor({
  avatarUrl,
  username,
  validation,
  fieldError,
  disabled = false,
  continueLoading = false,
  continueDisabled = false,
  signOutLoading = false,
  signOutDisabled = false,
  onUsernameChange,
  onRefreshRandom,
  onContinue,
  onSignOut,
}: ProfileSetupEditorProps) {
  const styles = useStyles();
  const usernameCountLabel = useMemo(
    () => <Text style={styles.charCount}>{username.trim().length}/20</Text>,
    [styles, username],
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
          <View style={styles.actionsRow}>
            <View style={styles.actionButtonWrap}>
              <Button
                title="Sign out"
                variant="secondary"
                loading={signOutLoading}
                disabled={signOutDisabled || disabled}
                onPress={onSignOut}
              />
            </View>
            <View style={styles.actionButtonWrap}>
              <Button
                title="Continue"
                loading={continueLoading}
                disabled={continueDisabled || disabled}
                onPress={onContinue}
              />
            </View>
          </View>
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
  const styles = useStyles();
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

const useStyles = createThemedStyles(({ colors }) => ({
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
    color: colors.ink,
    alignSelf: "flex-start",
  },
  headerSubtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkFaint,
    alignSelf: "flex-start",
  },
  bodyInner: {
    padding: BENTO_FORM_SECTION_PADDING,
    gap: BENTO_FORM_BODY_GAP,
  },
  usernameBlock: {
    gap: 4,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  actionButtonWrap: {
    flex: 1,
  },
  charCount: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  hint: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  hintMuted: {
    color: colors.inkSoft,
  },
  hintOk: {
    color: colors.accentText,
  },
}));

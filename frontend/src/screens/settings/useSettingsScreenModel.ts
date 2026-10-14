import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback } from "react";

import { replayAppTour } from "@/features/appTour/utils/replayAppTour";
import { useConfirmSignOut } from "@/features/auth/hooks/useConfirmSignOut";
import { useRefreshAppData } from "@/features/settings/hooks/useRefreshAppData";
import { useUserProfile } from "@/hooks/useUserProfile";
import type { MainStackParamList } from "@/navigation/types";
import { THEME_PREFERENCE_LABELS, useThemePreference } from "@/theme";

type SettingsHubDestination =
  | "SettingsAccount"
  | "SettingsHaptic"
  | "SettingsAppearance"
  | "SettingsNotifications"
  | "SettingsEmail"
  | "SettingsGlossary"
  | "SettingsPermissions"
  | "SettingsFeedback";

export function useSettingsScreenModel() {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { displayName, email, avatarUrl } = useUserProfile();
  const { preference } = useThemePreference();
  const { confirmSignOut, signOutLoading, signOutConfirmModalProps } =
    useConfirmSignOut();
  const { confirmRefreshAppData, loading: refreshLoading } =
    useRefreshAppData();

  const openDestination = useCallback(
    (destination: SettingsHubDestination) => navigation.navigate(destination),
    [navigation],
  );

  return {
    displayName,
    email,
    avatarUrl,
    appearanceLabel: THEME_PREFERENCE_LABELS[preference],
    signOutLoading,
    signOutConfirmModalProps,
    refreshLoading,
    openDestination,
    onShowAppTour: replayAppTour,
    onSignOut: confirmSignOut,
    onRefreshPress: confirmRefreshAppData,
  };
}

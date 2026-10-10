import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback } from "react";

import { useConfirmSignOut } from "@/features/auth/hooks/useConfirmSignOut";
import type { RecurringKind } from "@/features/recurring/types";
import { useRefreshAppData } from "@/features/settings/hooks/useRefreshAppData";
import { useUserProfile } from "@/hooks/useUserProfile";
import type { MainStackParamList } from "@/navigation/types";

type SettingsHubDestination =
  | "SettingsAccount"
  | "SettingsHaptic"
  | "SettingsNotifications"
  | "SettingsEmail"
  | "SettingsGlossary"
  | "SettingsPermissions"
  | "SettingsFeedback";

export function useSettingsScreenModel() {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { displayName, email, avatarUrl } = useUserProfile();
  const { confirmSignOut, signOutLoading, signOutConfirmModalProps } =
    useConfirmSignOut();
  const { confirmRefreshAppData, loading: refreshLoading } =
    useRefreshAppData();

  const openDestination = useCallback(
    (destination: SettingsHubDestination) => navigation.navigate(destination),
    [navigation],
  );

  const openRecurring = useCallback(
    (kind: RecurringKind) => navigation.navigate("RecurringList", { kind }),
    [navigation],
  );

  return {
    displayName,
    email,
    avatarUrl,
    signOutLoading,
    signOutConfirmModalProps,
    refreshLoading,
    openDestination,
    openRecurring,
    onSignOut: confirmSignOut,
    onRefreshPress: confirmRefreshAppData,
  };
}

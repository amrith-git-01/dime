import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  Bell,
  BookOpen,
  MessageSquareText,
  ScanLine,
  Shield,
  Vibrate,
} from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { ConfirmModal } from "@/components/shared";
import { Button } from "@/components/ui";
import { fontFamilies, inkSoft, spacing } from "@/constants";
import { useConfirmSignOut } from "@/features/auth/hooks/useConfirmSignOut";
import {
  SettingsHubHero,
  SettingsNavRow,
  SettingsSection,
} from "@/features/settings/components";
import { SETTINGS_SECTION_GAP } from "@/features/settings/constants/settingsTokens";
import { useRefreshAppData } from "@/features/settings/hooks/useRefreshAppData";
import { useUserProfile } from "@/hooks/useUserProfile";
import type { MainStackParamList } from "@/navigation/types";

export default function SettingsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { displayName, email, avatarUrl } = useUserProfile();
  const { confirmSignOut, signOutLoading, signOutConfirmModalProps } =
    useConfirmSignOut();
  const { confirmRefreshAppData, loading: refreshLoading } =
    useRefreshAppData();

  const openAccount = () => navigation.navigate("SettingsAccount");

  const handleRefreshPress = () => {
    confirmRefreshAppData();
  };

  return (
    <View style={styles.root}>
      <SettingsSection title="Account">
        <View style={styles.accountInner}>
          <SettingsHubHero
            displayName={displayName}
            email={email}
            avatarUrl={avatarUrl}
            onPress={openAccount}
          />
        </View>
      </SettingsSection>

      <SettingsSection title="Preferences">
        <View style={styles.preferencesInner}>
          <SettingsNavRow
            icon={Vibrate}
            label="Haptic feedback"
            subtitle="Tap feedback on buttons and actions"
            onPress={() => navigation.navigate("SettingsHaptic")}
            showSeparator
          />
          <SettingsNavRow
            icon={Bell}
            label="Notifications & alerts"
            subtitle="Device permission, budget limits, and capture alerts"
            onPress={() => navigation.navigate("SettingsNotifications")}
            showSeparator
          />
          <SettingsNavRow
            icon={ScanLine}
            label="Automatic capture"
            subtitle="Bank SMS review on this device"
            onPress={() => navigation.navigate("SettingsCapture")}
          />
        </View>
      </SettingsSection>

      <SettingsSection title="Help">
        <View style={styles.preferencesInner}>
          <SettingsNavRow
            icon={BookOpen}
            label="Glossary"
            subtitle="What Debit, Payee, and other labels mean"
            onPress={() => navigation.navigate("SettingsGlossary")}
            showSeparator
          />
          <SettingsNavRow
            icon={Shield}
            label="Permissions"
            subtitle="What we ask for, how we use it, and why"
            onPress={() => navigation.navigate("SettingsPermissions")}
          />
        </View>
      </SettingsSection>

      <SettingsSection title="Feedback">
        <View style={styles.preferencesInner}>
          <SettingsNavRow
            icon={MessageSquareText}
            label="Send feedback"
            subtitle="Bugs, ideas, and enhancements"
            onPress={() => navigation.navigate("SettingsFeedback")}
          />
        </View>
      </SettingsSection>

      <SettingsSection title="Data">
        <View style={styles.dataInner}>
          <Text style={styles.dataHint}>
            Clear offline cache and download the latest transactions, insights,
            and notifications from the server.
          </Text>
          <Button
            title="Refresh from server"
            variant="ghost"
            loading={refreshLoading}
            disabled={refreshLoading || signOutLoading}
            onPress={handleRefreshPress}
          />
        </View>
      </SettingsSection>

      <View style={styles.signOutWrap}>
        <Button
          title="Sign out"
          variant="danger"
          loading={signOutLoading}
          disabled={signOutLoading || refreshLoading}
          onPress={confirmSignOut}
        />
      </View>

      <ConfirmModal
        {...signOutConfirmModalProps}
        title="Sign out?"
        message="You'll need to sign in again to use the app."
        cancelLabel="Cancel"
        confirmLabel="Sign out"
        confirmTone="danger"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: SETTINGS_SECTION_GAP,
  },
  accountInner: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  dataInner: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  preferencesInner: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  signOutWrap: {
    marginTop: spacing.sm,
  },
  dataHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: inkSoft,
  },
});

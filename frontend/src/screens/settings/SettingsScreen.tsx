import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MessageSquareText, ScanLine } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { BENTO_SECTION_GAP } from "@/components/bento";
import { ConfirmModal } from "@/components/shared";
import { Button } from "@/components/ui";
import { fontFamilies, inkSoft, spacing } from "@/constants";
import { useConfirmSignOut } from "@/features/auth/hooks/useConfirmSignOut";
import {
  SETTINGS_ROW_ACCENTS,
  SettingsHubHero,
  SettingsNavRow,
  SettingsSection,
} from "@/features/settings/components";
import { useRefreshAppData } from "@/features/settings/hooks/useRefreshAppData";
import { useUserProfile } from "@/hooks/useUserProfile";
import type { MainStackParamList } from "@/navigation/types";

export default function SettingsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { displayName, avatarUrl } = useUserProfile();
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
      <Text style={styles.lede}>
        Profile, capture, and feedback — tuned for how you use Dime.
      </Text>

      <SettingsHubHero
        displayName={displayName}
        avatarUrl={avatarUrl}
        onPress={openAccount}
      />

      <SettingsSection title="Preferences">
        <SettingsNavRow
          icon={ScanLine}
          iconAccent={SETTINGS_ROW_ACCENTS.capture}
          label="Automatic capture"
          subtitle="UPI detection on this device"
          onPress={() => navigation.navigate("SettingsCapture")}
          showSeparator
        />
        <SettingsNavRow
          icon={MessageSquareText}
          iconAccent={SETTINGS_ROW_ACCENTS.feedback}
          label="Send feedback"
          subtitle="Ideas, bugs, and product thoughts"
          onPress={() => navigation.navigate("SettingsFeedback")}
        />
      </SettingsSection>

      <SettingsSection title="Data">
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
      </SettingsSection>

      <View style={styles.signOutWrap}>
        <Button
          title="Sign out"
          variant="ghostDanger"
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
    gap: BENTO_SECTION_GAP,
  },
  lede: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 22,
    color: inkSoft,
    marginBottom: -spacing.sm,
  },
  signOutWrap: {
    marginTop: spacing.sm,
  },
  dataHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: inkSoft,
    marginBottom: spacing.sm,
  },
});

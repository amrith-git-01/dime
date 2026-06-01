import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MessageSquareText, ScanLine } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { BENTO_SECTION_GAP } from "@/components/bento";
import {
  SETTINGS_ROW_ACCENTS,
  SettingsHubHero,
  SettingsNavRow,
  SettingsSection,
} from "@/features/settings/components";
import { Button } from "@/components/ui";
import { colors, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { useConfirmSignOut } from "@/features/auth/hooks/useConfirmSignOut";
import { useUserProfile } from "@/hooks/useUserProfile";
import type { MainStackParamList } from "@/navigation/types";

export default function SettingsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { displayName, avatarUrl } = useUserProfile();
  const { confirmSignOut, signOutLoading } = useConfirmSignOut();

  const openAccount = () => navigation.navigate("SettingsAccount");

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
          subtitle="SMS and UPI detection on this device"
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

      <View style={styles.signOutWrap}>
        <Button
          title="Sign out"
          variant="danger"
          loading={signOutLoading}
          disabled={signOutLoading}
          onPress={confirmSignOut}
        />
      </View>
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
    color: colors.textSecondary,
    marginBottom: -spacing.sm,
  },
  signOutWrap: {
    marginTop: spacing.sm,
  },
});

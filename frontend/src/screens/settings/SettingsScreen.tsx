import {
  Bell,
  BookOpen,
  Compass,
  Mail,
  MessageSquareText,
  Shield,
  SunMoon,
  Vibrate,
} from "lucide-react-native";
import * as Updates from "expo-updates";
import { Text, View } from "react-native";

import { ConfirmModal } from "@/components/shared";
import { Button } from "@/components/ui";
import { fontFamilies, spacing } from "@/constants";
import {
  SettingsHubHero,
  SettingsNavRow,
  SettingsSection,
} from "@/features/settings/components";
import { TodaysLimitsSection } from "@/features/limits/components";
import { SETTINGS_SECTION_GAP } from "@/features/settings/constants/settingsTokens";

import { useSettingsScreenModel } from "./useSettingsScreenModel";
import { createThemedStyles } from "@/theme";

/** "Dime 1.0.0 · update ab12cd34" (or "built-in"): shows which OTA update the app is running. */
const VERSION_LABEL = `Dime ${Updates.runtimeVersion ?? ""} · ${
  Updates.isEmbeddedLaunch || !Updates.updateId ? "built-in" : `update ${Updates.updateId.slice(0, 8)}`
}`;

export default function SettingsScreen() {
  const styles = useStyles();
  const model = useSettingsScreenModel();
  const { openDestination } = model;

  return (
    <View style={styles.root}>
      <SettingsSection title="Account">
        <View style={styles.accountInner}>
          <SettingsHubHero
            displayName={model.displayName}
            email={model.email}
            avatarUrl={model.avatarUrl}
            onPress={() => openDestination("SettingsAccount")}
          />
        </View>
      </SettingsSection>

      <SettingsSection title="Preferences">
        <View style={styles.preferencesInner}>
          <SettingsNavRow
            icon={SunMoon}
            label="Appearance"
            subtitle={model.appearanceLabel}
            onPress={() => openDestination("SettingsAppearance")}
            showSeparator
          />
          <SettingsNavRow
            icon={Vibrate}
            label="Haptic feedback"
            subtitle="Tap feedback on buttons and actions"
            onPress={() => openDestination("SettingsHaptic")}
            showSeparator
          />
          <SettingsNavRow
            icon={Bell}
            label="Notifications & alerts"
            subtitle="Device permission, budget limits, and capture alerts"
            onPress={() => openDestination("SettingsNotifications")}
            showSeparator
          />
          <SettingsNavRow
            icon={Mail}
            label="Email summaries"
            subtitle="Weekly Monday and monthly 1st, 08:00 IST"
            onPress={() => openDestination("SettingsEmail")}
          />
        </View>
      </SettingsSection>

      <TodaysLimitsSection />

      <SettingsSection title="Help">
        <View style={styles.preferencesInner}>
          <SettingsNavRow
            icon={BookOpen}
            label="Glossary"
            subtitle="What Debit, Payee, and other labels mean"
            onPress={() => openDestination("SettingsGlossary")}
            showSeparator
          />
          <SettingsNavRow
            icon={Shield}
            label="Permissions"
            subtitle="What we ask for, how we use it, and why"
            onPress={() => openDestination("SettingsPermissions")}
            showSeparator
          />
          <SettingsNavRow
            icon={Compass}
            label="Show app tour"
            subtitle="A 30-second walk through the main features"
            onPress={model.onShowAppTour}
          />
        </View>
      </SettingsSection>

      <SettingsSection title="Feedback">
        <View style={styles.preferencesInner}>
          <SettingsNavRow
            icon={MessageSquareText}
            label="Send feedback"
            subtitle="Bugs, ideas, and enhancements"
            onPress={() => openDestination("SettingsFeedback")}
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
            loading={model.refreshLoading}
            disabled={model.refreshLoading || model.signOutLoading}
            onPress={model.onRefreshPress}
          />
        </View>
      </SettingsSection>

      <View style={styles.signOutWrap}>
        <Button
          title="Sign out"
          variant="danger"
          loading={model.signOutLoading}
          disabled={model.signOutLoading || model.refreshLoading}
          onPress={model.onSignOut}
        />
        <Text style={styles.versionLabel}>{VERSION_LABEL}</Text>
      </View>

      <ConfirmModal
        {...model.signOutConfirmModalProps}
        title="Sign out?"
        message="You'll need to sign in again to use the app."
        cancelLabel="Cancel"
        confirmLabel="Sign out"
        confirmTone="danger"
      />
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
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
    gap: spacing.md,
  },
  versionLabel: {
    textAlign: "center",
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  dataHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
}));

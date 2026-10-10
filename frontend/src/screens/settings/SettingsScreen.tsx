import {
  Banknote,
  Bell,
  BookOpen,
  Mail,
  MessageSquareText,
  Repeat,
  Shield,
  Vibrate,
} from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { ConfirmModal } from "@/components/shared";
import { Button } from "@/components/ui";
import { fontFamilies, inkSoft, spacing } from "@/constants";
import {
  SettingsHubHero,
  SettingsNavRow,
  SettingsSection,
} from "@/features/settings/components";
import { TodaysLimitsSection } from "@/features/limits/components";
import { RECURRING_COPY } from "@/features/recurring/utils/recurringDisplay";
import { SETTINGS_SECTION_GAP } from "@/features/settings/constants/settingsTokens";

import { useSettingsScreenModel } from "./useSettingsScreenModel";

export default function SettingsScreen() {
  const model = useSettingsScreenModel();
  const { openDestination, openRecurring } = model;

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

      <SettingsSection title="Money">
        <View style={styles.preferencesInner}>
          <SettingsNavRow
            icon={Banknote}
            label={RECURRING_COPY.income.hubLabel}
            subtitle={RECURRING_COPY.income.hubSubtitle}
            onPress={() => openRecurring("income")}
            showSeparator
          />
          <SettingsNavRow
            icon={Repeat}
            label={RECURRING_COPY.subscription.hubLabel}
            subtitle={RECURRING_COPY.subscription.hubSubtitle}
            onPress={() => openRecurring("subscription")}
          />
        </View>
      </SettingsSection>

      <SettingsSection title="Preferences">
        <View style={styles.preferencesInner}>
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

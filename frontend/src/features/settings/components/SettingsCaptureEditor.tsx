import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  BENTO_FORM_BODY_GAP,
  BENTO_FORM_SECTION_PADDING,
} from "@/components/bento";
import { TwoToneCard } from "@/components/shared";
import { bento } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { SettingsToggleRow } from "./SettingsToggleRow";

export type SettingsCaptureEditorProps = {
  smsEnabled: boolean;
  upiEnabled: boolean;
  onSmsChange: (enabled: boolean) => void;
  onUpiChange: (enabled: boolean) => void;
  showSmsPermissionCta?: boolean;
  smsPermissionGranted?: boolean;
  onRequestSmsPermission?: () => void;
};

export const SettingsCaptureEditor = memo(function SettingsCaptureEditor({
  smsEnabled,
  upiEnabled,
  onSmsChange,
  onUpiChange,
  showSmsPermissionCta = false,
  smsPermissionGranted = false,
  onRequestSmsPermission,
}: SettingsCaptureEditorProps) {
  return (
    <TwoToneCard
      header={
        <View style={styles.headerInner}>
          <Text style={styles.kicker}>Automatic capture</Text>
          <Text style={styles.subtitle}>
            Choose how Dime can detect transactions on this device. SMS capture
            runs on your phone and only sends matching bank messages for
            parsing.
          </Text>
        </View>
      }
      body={
        <View style={styles.bodyInner}>
          <SettingsToggleRow
            label="SMS detection"
            subtitle="Read transaction SMS from banks and wallets (when permitted)."
            value={smsEnabled}
            onValueChange={onSmsChange}
            showSeparator
          />
          {showSmsPermissionCta && !smsPermissionGranted ? (
            <Pressable
              accessibilityRole="button"
              onPress={onRequestSmsPermission}
              style={styles.permissionCta}
            >
              <Text style={styles.permissionCtaText}>Grant SMS access</Text>
              <Text style={styles.permissionHint}>
                Required on Android for automatic bank SMS capture.
              </Text>
            </Pressable>
          ) : null}
          <SettingsToggleRow
            label="UPI app hints"
            subtitle="Use UPI notifications to suggest amounts and payees."
            value={upiEnabled}
            onValueChange={onUpiChange}
          />
        </View>
      }
    />
  );
});

const styles = StyleSheet.create({
  headerInner: {
    padding: BENTO_FORM_SECTION_PADDING,
    gap: BENTO_FORM_BODY_GAP / 2,
  },
  kicker: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: bento.onPastel.primary,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: bento.onPastel.muted,
  },
  bodyInner: {
    paddingHorizontal: BENTO_FORM_SECTION_PADDING,
    paddingBottom: BENTO_FORM_SECTION_PADDING,
  },
  permissionCta: {
    paddingVertical: 12,
    gap: 4,
  },
  permissionCtaText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: bento.onPastel.primary,
  },
  permissionHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: bento.onPastel.muted,
  },
});

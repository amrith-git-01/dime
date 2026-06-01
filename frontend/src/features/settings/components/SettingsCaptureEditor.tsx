import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  BENTO_FORM_BODY_GAP,
  BENTO_FORM_SECTION_PADDING,
} from "@/components/bento";
import { SettingsToggleRow } from "./SettingsToggleRow";
import { TwoToneCard } from "@/components/shared";
import { bento } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

export type SettingsCaptureEditorProps = {
  smsEnabled: boolean;
  upiEnabled: boolean;
  onSmsChange: (enabled: boolean) => void;
  onUpiChange: (enabled: boolean) => void;
};

export const SettingsCaptureEditor = memo(function SettingsCaptureEditor({
  smsEnabled,
  upiEnabled,
  onSmsChange,
  onUpiChange,
}: SettingsCaptureEditorProps) {
  return (
    <TwoToneCard
      header={
        <View style={styles.headerInner}>
          <Text style={styles.kicker}>Automatic capture</Text>
          <Text style={styles.subtitle}>
            Choose how Dime can detect transactions on this device. Changes
            apply locally until capture services are connected.
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
});

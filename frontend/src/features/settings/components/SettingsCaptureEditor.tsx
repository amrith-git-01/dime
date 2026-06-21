import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  BENTO_FORM_BODY_GAP,
  BENTO_FORM_SECTION_PADDING,
} from "@/components/bento";
import { fontFamilies, ink, inkSoft, radius, shadows, surface } from "@/constants";
import { SettingsToggleRow } from "./SettingsToggleRow";

export type SettingsCaptureEditorProps = {
  upiEnabled: boolean;
  onUpiChange: (enabled: boolean) => void;
};

export const SettingsCaptureEditor = memo(function SettingsCaptureEditor({
  upiEnabled,
  onUpiChange,
}: SettingsCaptureEditorProps) {
  return (
    <View style={styles.card}>
      <View style={styles.headerInner}>
        <Text style={styles.kicker}>Automatic capture</Text>
        <Text style={styles.subtitle}>
          Use UPI notifications to suggest amounts and payees when adding
          expenses.
        </Text>
      </View>
      <View style={styles.bodyInner}>
        <SettingsToggleRow
          label="UPI app hints"
          subtitle="Use UPI notifications to suggest amounts and payees."
          value={upiEnabled}
          onValueChange={onUpiChange}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: surface,
    borderRadius: radius.lg,
    overflow: "visible",
    ...shadows.card,
  },
  headerInner: {
    padding: BENTO_FORM_SECTION_PADDING,
    gap: BENTO_FORM_BODY_GAP / 2,
  },
  kicker: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: ink,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: inkSoft,
  },
  bodyInner: {
    paddingHorizontal: BENTO_FORM_SECTION_PADDING,
    paddingBottom: BENTO_FORM_SECTION_PADDING,
  },
});

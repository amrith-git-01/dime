import { StyleSheet, View } from "react-native";

import {
  ReportSettingsEditor,
  ReportsListEditor,
} from "@/features/brokeReport/components";
import { SETTINGS_SECTION_GAP } from "@/features/settings/constants/settingsTokens";

import { useSettingsBrokeReportsScreenModel } from "./useSettingsBrokeReportsScreenModel";

export default function SettingsBrokeReportsScreen() {
  const { listProps, settingsProps } = useSettingsBrokeReportsScreenModel();
  return (
    <View style={styles.root}>
      <ReportSettingsEditor {...settingsProps} />
      <ReportsListEditor {...listProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: SETTINGS_SECTION_GAP,
  },
});

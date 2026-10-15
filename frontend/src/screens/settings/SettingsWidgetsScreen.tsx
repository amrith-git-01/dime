import { SettingsWidgetsEditor } from "@/features/settings/components";

import { useSettingsWidgetsScreenModel } from "./useSettingsWidgetsScreenModel";

export default function SettingsWidgetsScreen() {
  const { editorProps } = useSettingsWidgetsScreenModel();
  return <SettingsWidgetsEditor {...editorProps} />;
}

import { SettingsAppearanceEditor } from "@/features/settings/components";

import { useSettingsAppearanceScreenModel } from "./useSettingsAppearanceScreenModel";

export default function SettingsAppearanceScreen() {
  const { editorProps } = useSettingsAppearanceScreenModel();
  return <SettingsAppearanceEditor {...editorProps} />;
}

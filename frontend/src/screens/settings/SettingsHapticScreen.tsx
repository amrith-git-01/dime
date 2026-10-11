import { SettingsHapticEditor } from "@/features/settings/components";

import { useSettingsHapticScreenModel } from "./useSettingsHapticScreenModel";

export default function SettingsHapticScreen() {
  const { editorProps } = useSettingsHapticScreenModel();
  return <SettingsHapticEditor {...editorProps} />;
}

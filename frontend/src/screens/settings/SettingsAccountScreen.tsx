import { SettingsAccountEditor } from "@/features/settings/components";

import { useSettingsAccountScreenModel } from "./useSettingsAccountScreenModel";

export default function SettingsAccountScreen() {
  const { editorProps } = useSettingsAccountScreenModel();
  return <SettingsAccountEditor {...editorProps} />;
}

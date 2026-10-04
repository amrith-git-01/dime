import { SettingsEmailEditor } from "@/features/settings/components";

import { useSettingsEmailScreenModel } from "./useSettingsEmailScreenModel";

export default function SettingsEmailScreen() {
  const { editorProps } = useSettingsEmailScreenModel();
  return <SettingsEmailEditor {...editorProps} />;
}

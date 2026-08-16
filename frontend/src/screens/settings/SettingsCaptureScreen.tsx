import { SettingsCaptureEditor } from "@/features/settings/components";

import { useSettingsCaptureScreenModel } from "./useSettingsCaptureScreenModel";

export default function SettingsCaptureScreen() {
  const { editorProps } = useSettingsCaptureScreenModel();
  return <SettingsCaptureEditor {...editorProps} />;
}

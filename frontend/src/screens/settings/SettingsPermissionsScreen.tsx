import { SettingsGlossaryEditor } from "@/features/settings/components";

import { useSettingsPermissionsScreenModel } from "./useSettingsPermissionsScreenModel";

export default function SettingsPermissionsScreen() {
  const model = useSettingsPermissionsScreenModel();
  return <SettingsGlossaryEditor {...model} />;
}

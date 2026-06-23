import { SettingsGlossaryEditor } from "@/features/settings/components";

import { useSettingsGlossaryScreenModel } from "./useSettingsGlossaryScreenModel";

export default function SettingsGlossaryScreen() {
  const model = useSettingsGlossaryScreenModel();
  return <SettingsGlossaryEditor {...model} />;
}

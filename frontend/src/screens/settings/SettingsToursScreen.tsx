import { SettingsToursEditor } from "@/features/settings/components";

import { useSettingsToursScreenModel } from "./useSettingsToursScreenModel";

export default function SettingsToursScreen() {
  const model = useSettingsToursScreenModel();
  return <SettingsToursEditor {...model} />;
}

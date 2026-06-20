import { SettingsCaptureEditor } from "@/features/settings/components";
import { useCapturePreferences } from "@/features/settings/hooks/useCapturePreferences";

export default function SettingsCaptureScreen() {
  const { upiEnabled, setUpi } = useCapturePreferences();

  return <SettingsCaptureEditor onUpiChange={setUpi} upiEnabled={upiEnabled} />;
}

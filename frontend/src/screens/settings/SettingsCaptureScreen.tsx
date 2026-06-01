import { SettingsCaptureEditor } from "@/features/settings/components";
import { useCapturePreferences } from "@/features/settings/hooks/useCapturePreferences";

export default function SettingsCaptureScreen() {
  const { smsEnabled, upiEnabled, setSms, setUpi } = useCapturePreferences();

  return (
    <SettingsCaptureEditor
      smsEnabled={smsEnabled}
      upiEnabled={upiEnabled}
      onSmsChange={setSms}
      onUpiChange={setUpi}
    />
  );
}

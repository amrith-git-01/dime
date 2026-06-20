import { useEffect, useState } from "react";

import { SettingsCaptureEditor } from "@/features/settings/components";
import { useCapturePreferences } from "@/features/settings/hooks/useCapturePreferences";
import { ensureSmsReadPermission } from "@/features/transactions/sms/readInboxSms";

export default function SettingsCaptureScreen() {
  const { smsScanEnabled, setSmsScan } = useCapturePreferences();
  const [showOpenSettings, setShowOpenSettings] = useState(false);

  useEffect(() => {
    void ensureSmsReadPermission().then((status) => {
      setShowOpenSettings(status === "denied");
    });
  }, [smsScanEnabled]);

  return (
    <SettingsCaptureEditor
      onSmsScanChange={setSmsScan}
      smsScanEnabled={smsScanEnabled}
      showOpenSettings={showOpenSettings}
    />
  );
}

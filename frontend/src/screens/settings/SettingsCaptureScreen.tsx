import { useCallback } from "react";
import { Platform } from "react-native";

import { useSmsPermission } from "@/features/capture/hooks/useSmsPermission";
import { SettingsCaptureEditor } from "@/features/settings/components";
import { useCapturePreferences } from "@/features/settings/hooks/useCapturePreferences";

export default function SettingsCaptureScreen() {
  const { smsEnabled, upiEnabled, setSms, setUpi } = useCapturePreferences();
  const { granted, request, refresh, openSettings, isAndroid } =
    useSmsPermission();

  const handleSmsChange = useCallback(
    (enabled: boolean) => {
      setSms(enabled);
      if (enabled && Platform.OS === "android") {
        void request().then((allowed) => {
          if (!allowed) {
            void refresh();
          }
        });
      }
    },
    [refresh, request, setSms],
  );

  const handleRequestSmsPermission = useCallback(() => {
    void request().then((allowed) => {
      if (!allowed) {
        openSettings();
      }
    });
  }, [openSettings, request]);

  return (
    <SettingsCaptureEditor
      smsEnabled={smsEnabled}
      upiEnabled={upiEnabled}
      onSmsChange={handleSmsChange}
      onUpiChange={setUpi}
      showSmsPermissionCta={isAndroid && smsEnabled}
      smsPermissionGranted={granted}
      onRequestSmsPermission={handleRequestSmsPermission}
    />
  );
}

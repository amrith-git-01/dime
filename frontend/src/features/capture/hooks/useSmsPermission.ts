import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";

import {
  getSmsPermissionStatus,
  openAppSettings,
  requestSmsPermissions,
  type SmsPermissionStatus,
} from "./smsPermission";

export function useSmsPermission() {
  const [status, setStatus] = useState<SmsPermissionStatus>({
    granted: false,
    read: false,
    receive: false,
  });
  const [checking, setChecking] = useState(Platform.OS === "android");

  const refresh = useCallback(async () => {
    if (Platform.OS !== "android") {
      setStatus({ granted: false, read: false, receive: false });
      setChecking(false);
      return false;
    }
    setChecking(true);
    try {
      const next = await getSmsPermissionStatus();
      setStatus(next);
      return next.granted;
    } finally {
      setChecking(false);
    }
  }, []);

  const request = useCallback(async () => {
    if (Platform.OS !== "android") {
      return false;
    }
    setChecking(true);
    try {
      const granted = await requestSmsPermissions();
      const next = await getSmsPermissionStatus();
      setStatus(next);
      return granted && next.granted;
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    granted: status.granted,
    readGranted: status.read,
    receiveGranted: status.receive,
    checking,
    refresh,
    request,
    openSettings: openAppSettings,
    isAndroid: Platform.OS === "android",
  };
}

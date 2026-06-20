import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { submitSmsCapture } from "@/features/capture/api/submitSmsCaptureApi";
import { loadSmsListenerModule } from "@/features/capture/hooks/smsListenerModule";
import { isTransactionSms } from "@/features/capture/utils/isTransactionSms";
import { shouldProcessSms } from "@/features/capture/utils/recentSmsDedupe";
import { useCapturePreferencesStore } from "@/stores/capturePreferencesStore";

import { hasSmsPermissions, requestSmsPermissions } from "./smsPermission";

/**
 * Starts the Android SMS listener when the user is signed in and SMS capture is on.
 * Parses locally, then queues matching bank SMS on the backend.
 */
export function useSmsCaptureService(active: boolean) {
  const queryClient = useQueryClient();
  const smsEnabled = useCapturePreferencesStore((s) => s.smsEnabled);
  const listeningRef = useRef(false);
  const inFlightRef = useRef(new Set<string>());
  const permissionPromptedRef = useRef(false);
  const [permissionTick, setPermissionTick] = useState(0);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        permissionPromptedRef.current = false;
        setPermissionTick((value) => value + 1);
      }
    });
    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const smsModule = loadSmsListenerModule();
    if (!active || !smsEnabled || !smsModule) {
      if (listeningRef.current && smsModule) {
        smsModule.stopSmsListener();
        listeningRef.current = false;
      }
      return;
    }

    let cancelled = false;

    const start = async () => {
      let permitted = await hasSmsPermissions();
      if (!permitted && !permissionPromptedRef.current) {
        permissionPromptedRef.current = true;
        permitted = await requestSmsPermissions();
      }
      if (cancelled || !permitted) {
        return;
      }

      smsModule.startSmsListener((message) => {
        void (async () => {
          const body = message.body?.trim() ?? "";
          const sender = message.sender?.trim() ?? "";
          if (!isTransactionSms(body, sender)) {
            return;
          }
          if (!(await shouldProcessSms(body, sender))) {
            return;
          }
          if (inFlightRef.current.has(message.id)) {
            return;
          }
          inFlightRef.current.add(message.id);

          try {
            await submitSmsCapture({
              text: body,
              sender: sender || undefined,
              receivedAt: new Date(message.timestamp).toISOString(),
            });
            void queryClient.invalidateQueries({ refetchType: "active" });
          } catch (error) {
            console.warn("[SmsCapture] submit failed:", error);
          } finally {
            inFlightRef.current.delete(message.id);
          }
        })();
      });
      listeningRef.current = true;
    };

    void start();

    return () => {
      cancelled = true;
      if (listeningRef.current) {
        smsModule.stopSmsListener();
        listeningRef.current = false;
      }
    };
  }, [active, permissionTick, queryClient, smsEnabled]);
}

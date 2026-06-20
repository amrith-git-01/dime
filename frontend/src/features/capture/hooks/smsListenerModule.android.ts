import {
  startReadSMS,
  stopReadSMS,
} from "@maniac-tech/react-native-expo-read-sms";

import { parseExpoReadSmsPayload } from "@/features/capture/utils/parseExpoReadSmsPayload";

import type { SmsListenerModule } from "./smsListenerModule.types";

export type { SmsListenerModule } from "./smsListenerModule.types";

export function loadSmsListenerModule(): SmsListenerModule | null {
  return {
    startSmsListener(callback) {
      void startReadSMS((status, sms, error) => {
        if (status !== "success" || typeof sms !== "string") {
          if (error) {
            console.warn("[SmsCapture] listener error:", error);
          }
          return;
        }
        const parsed = parseExpoReadSmsPayload(sms);
        if (!parsed) {
          return;
        }
        callback({
          id: `${parsed.sender}:${parsed.body.length}:${Date.now()}`,
          sender: parsed.sender,
          body: parsed.body,
          timestamp: Date.now(),
        });
      });
    },
    stopSmsListener() {
      stopReadSMS();
    },
  };
}

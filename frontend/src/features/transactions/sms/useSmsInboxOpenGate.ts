import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

import {
  ensureSmsReadPermission,
  queryInboxSince,
} from "@/features/transactions/sms/readInboxSms";
import { decideSmsGate } from "@/features/transactions/sms/smsGate";
import {
  ensureSmsWatermarkOnFirstGrant,
  setSmsWatermarkMs,
} from "@/features/transactions/sms/smsWatermarkStorage";
import { useCapturePreferencesStore } from "@/stores/capturePreferencesStore";
import { useSmsInboxReviewStore } from "@/stores/smsInboxReviewStore";
import { reportError } from "@/lib/reportError";

/**
 * Runs the on-open SMS gate while the authed Main shell would otherwise show.
 */
export function useSmsInboxOpenGate(input: {
  userId: string | null;
  mainActive: boolean;
}): void {
  const { userId, mainActive } = input;
  const smsScanEnabled = useCapturePreferencesStore((s) => s.smsScanEnabled);
  const phase = useSmsInboxReviewStore((s) => s.phase);
  const beginScan = useSmsInboxReviewStore((s) => s.beginScan);
  const beginReview = useSmsInboxReviewStore((s) => s.beginReview);
  const markDone = useSmsInboxReviewStore((s) => s.markDone);
  const resetIdle = useSmsInboxReviewStore((s) => s.resetIdle);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const scanGenRef = useRef(0);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev.match(/inactive|background/) && next === "active") {
        const current = useSmsInboxReviewStore.getState().phase;
        if (current === "done") {
          resetIdle();
        }
      }
    });
    return () => sub.remove();
  }, [resetIdle]);

  useEffect(() => {
    if (!mainActive || !userId) {
      return;
    }
    if (!smsScanEnabled) {
      markDone();
      return;
    }
    if (phase !== "idle") {
      return;
    }

    const gen = ++scanGenRef.current;
    beginScan();

    void (async () => {
      try {
        const permission = await ensureSmsReadPermission();
        if (gen !== scanGenRef.current) {
          return;
        }
        if (permission !== "granted") {
          markDone();
          return;
        }

        const watermarkMs = ensureSmsWatermarkOnFirstGrant(userId);
        let inbox: Awaited<ReturnType<typeof queryInboxSince>> = [];
        try {
          inbox = await queryInboxSince(watermarkMs);
        } catch (error) {
          reportError(error, "sms-gate inbox query failed");
          markDone();
          return;
        }
        if (gen !== scanGenRef.current) {
          return;
        }

        const decision = decideSmsGate({
          toggleOn: true,
          permissionGranted: true,
          watermarkMs,
          inbox,
        });
        if (decision.kind === "review") {
          beginReview(decision.kept);
          return;
        }
        if (decision.kind === "zero-kept") {
          setSmsWatermarkMs(userId, decision.nextWatermarkMs);
        }
        markDone();
      } catch (error) {
        reportError(error, "sms open gate failed");
        markDone();
      }
    })();
  }, [
    beginReview,
    beginScan,
    mainActive,
    markDone,
    phase,
    smsScanEnabled,
    userId,
  ]);
}

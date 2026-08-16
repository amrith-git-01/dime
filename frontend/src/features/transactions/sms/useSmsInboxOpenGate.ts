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
      console.log("[sms-gate] skip", { mainActive, hasUser: Boolean(userId) });
      return;
    }
    if (!smsScanEnabled) {
      console.log("[sms-gate] skip: capture toggle off");
      markDone();
      return;
    }
    if (phase !== "idle") {
      console.log("[sms-gate] skip: phase", phase);
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
          console.log("[sms-gate] stop: permission", permission);
          markDone();
          return;
        }

        const watermarkMs = ensureSmsWatermarkOnFirstGrant(userId);
        let inbox: Awaited<ReturnType<typeof queryInboxSince>> = [];
        try {
          inbox = await queryInboxSince(watermarkMs);
        } catch (error) {
          console.warn("[sms-gate] inbox query failed", error);
          markDone();
          return;
        }
        if (gen !== scanGenRef.current) {
          return;
        }

        const newest = inbox.reduce(
          (max, row) => (row.dateMs > max ? row.dateMs : max),
          0,
        );
        const decision = decideSmsGate({
          toggleOn: true,
          permissionGranted: true,
          watermarkMs,
          inbox,
        });
        console.log("[sms-gate] result", {
          watermarkMs,
          watermarkAgeSec: Math.round((Date.now() - watermarkMs) / 1000),
          inboxCount: inbox.length,
          newestAgeSec:
            newest > 0 ? Math.round((Date.now() - newest) / 1000) : null,
          kind: decision.kind,
          kept:
            decision.kind === "review"
              ? decision.kept.map((row) => ({
                  address: row.address,
                  dateMs: row.dateMs,
                  preview: row.body.slice(0, 80),
                }))
              : [],
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
        console.warn("[sms] open gate failed", error);
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

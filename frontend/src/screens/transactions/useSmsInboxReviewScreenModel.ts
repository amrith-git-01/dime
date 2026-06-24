import { format } from "date-fns";
import { useCallback, useState } from "react";

import { useToast } from "@/features/toast/useToast";
import { submitSmsBatch } from "@/features/transactions/api/submitSmsBatchApi";
import { lastShownWatermarkMs } from "@/features/transactions/sms/smsGate";
import { redactSmsBody } from "@/features/transactions/sms/smsRedact";
import type { InboxSms } from "@/features/transactions/sms/smsTypes";
import { setSmsWatermarkMs } from "@/features/transactions/sms/smsWatermarkStorage";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import { useSmsInboxReviewStore } from "@/stores/smsInboxReviewStore";

export function useSmsInboxReviewScreenModel() {
  const { userId } = useSessionUserId();
  const phase = useSmsInboxReviewStore((s) => s.phase);
  const remaining = useSmsInboxReviewStore((s) => s.remaining);
  const shown = useSmsInboxReviewStore((s) => s.shown);
  const updateBody = useSmsInboxReviewStore((s) => s.updateBody);
  const deleteRow = useSmsInboxReviewStore((s) => s.deleteRow);
  const markDone = useSmsInboxReviewStore((s) => s.markDone);
  const { showToast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const formatStamp = useCallback((dateMs: number) => {
    return format(new Date(dateMs), "d MMM, h:mm a");
  }, []);

  const onCancel = useCallback(() => {
    markDone();
  }, [markDone]);

  const onSync = useCallback(async () => {
    if (!userId || syncing) {
      return;
    }
    const watermark = lastShownWatermarkMs(shown);
    setSyncing(true);
    try {
      if (remaining.length > 0) {
        await submitSmsBatch(
          remaining.map((row) => ({
            body: redactSmsBody(row.body),
            received_at: new Date(row.dateMs).toISOString(),
          })),
        );
      }
      if (watermark != null) {
        setSmsWatermarkMs(userId, watermark);
      }
      markDone();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not sync messages.";
      showToast({ message, variant: "error" });
    } finally {
      setSyncing(false);
    }
  }, [markDone, remaining, shown, showToast, syncing, userId]);

  return {
    phase,
    remaining,
    editingId,
    syncing,
    formatStamp,
    setEditingId,
    updateBody,
    deleteRow,
    onCancel,
    onSync,
  };
}

export type SmsInboxReviewRow = InboxSms;

import { confirmCapturePermissionReason } from "@/features/onboarding/utils/permissionReasonAlert";
import { invalidateLimitsQueries } from "@/features/limits/cache/invalidateLimitsQueries";
import { invalidateOnboardingProgress } from "@/features/onboarding/cache/invalidateOnboardingProgress";
import { useToast } from "@/features/toast/useToast";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { enqueueCapture } from "@/lib/outbox/outboxQueue";
import { sendOrQueue } from "@/lib/outbox/sendOrQueue";
import { useReceiptScanUiStore } from "@/stores/receiptScanUiStore";
import { useVoiceCaptureUiStore } from "@/stores/voiceCaptureUiStore";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";

import { submitVoice } from "../api/submitTransactionApi";
import { guessVoiceUploadMeta } from "../voice/guessVoiceMime";
import {
  MIN_VOICE_RECORDING_SECONDS,
  VOICE_RECORDING_TOO_SHORT_MESSAGE,
} from "../voice/voiceCaptureConstants";
import { VOICE_RECORDING_OPTIONS } from "../voice/voiceRecordingOptions";

type CapturePhase = "idle" | "preparing" | "recording";

function recordingDurationSeconds(
  recorder: ReturnType<typeof useAudioRecorder>,
  startedAtMs: number | null,
): number {
  const status = recorder.getStatus();
  if (status.durationMillis > 0) {
    return status.durationMillis / 1000;
  }
  if (recorder.currentTime > 0) {
    return recorder.currentTime;
  }
  if (startedAtMs != null) {
    return (Date.now() - startedAtMs) / 1000;
  }
  return 0;
}

export function useVoiceCaptureSession() {
  const visible = useVoiceCaptureUiStore((s) => s.visible);
  const close = useVoiceCaptureUiStore((s) => s.close);
  const { userId } = useSessionUserId();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const showBusy = useReceiptScanUiStore((s) => s.show);
  const hideBusy = useReceiptScanUiStore((s) => s.hide);

  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);

  const [phase, setPhase] = useState<CapturePhase>("idle");
  const isRecordingRef = useRef(false);
  const sessionAbortRef = useRef(false);
  const recordingStartedAtMsRef = useRef<number | null>(null);

  const cleanupRecording = useCallback(async () => {
    isRecordingRef.current = false;
    recordingStartedAtMsRef.current = null;
    try {
      await recorder.stop();
    } catch {
      /* best-effort: may not be recording */
    }
    try {
      await setAudioModeAsync({ allowsRecording: false });
    } catch {
      /* ignore */
    }
  }, [recorder]);

  const hardClose = useCallback(async () => {
    sessionAbortRef.current = true;
    await cleanupRecording();
    setPhase("idle");
    close();
  }, [cleanupRecording, close]);

  const requestDismiss = useCallback(() => {
    void triggerHaptic();
    if (isRecordingRef.current) {
      Alert.alert("Discard recording?", "Your voice note will not be saved.", [
        { text: "Keep", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            void hardClose();
          },
        },
      ]);
    } else {
      void hardClose();
    }
  }, [hardClose]);

  useEffect(() => {
    if (!visible) {
      sessionAbortRef.current = false;
      void cleanupRecording();
      setPhase("idle");
      return;
    }

    sessionAbortRef.current = false;
    let alive = true;

    void (async () => {
      setPhase("preparing");

      if (!userId) {
        Alert.alert(
          "Sign in required",
          "Sign in to add a transaction by voice.",
        );
        await hardClose();
        return;
      }

      // First time only: say why before the system dialog.
      const proceed = await confirmCapturePermissionReason("microphone");
      if (sessionAbortRef.current || !alive) {
        return;
      }
      if (!proceed) {
        await hardClose();
        return;
      }

      const perm = await requestRecordingPermissionsAsync();

      if (sessionAbortRef.current || !alive) {
        return;
      }

      if (!perm.granted) {
        Alert.alert(
          "Microphone needed",
          "Allow microphone access to record a spoken expense.",
        );
        await hardClose();
        return;
      }

      try {
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
          shouldPlayInBackground: false,
          interruptionMode: "duckOthers",
        });
      } catch {
        Alert.alert(
          "Could not use microphone",
          "Try again or add the transaction manually.",
        );
        await hardClose();
        return;
      }

      if (sessionAbortRef.current || !alive) {
        return;
      }

      try {
        await recorder.prepareToRecordAsync();
        if (sessionAbortRef.current || !alive) {
          await cleanupRecording();
          return;
        }
        recorder.record();
        if (sessionAbortRef.current || !alive) {
          await cleanupRecording();
          return;
        }
        isRecordingRef.current = true;
        recordingStartedAtMsRef.current = Date.now();
        setPhase("recording");
      } catch {
        Alert.alert(
          "Could not start recording",
          "Try again or add the transaction manually.",
        );
        await hardClose();
      }
    })();

    return () => {
      alive = false;
      sessionAbortRef.current = true;
      void cleanupRecording();
    };
  }, [visible, userId, cleanupRecording, hardClose, recorder]);

  const stopAndSubmit = useCallback(async () => {
    void triggerHaptic();
    if (!isRecordingRef.current) {
      return;
    }

    isRecordingRef.current = false;
    setPhase("preparing");

    let uri: string | null = null;
    try {
      await recorder.stop();
      uri = recorder.uri;
    } catch {
      Alert.alert("Recording error", "Could not finish recording. Try again.");
      await hardClose();
      return;
    }

    try {
      await setAudioModeAsync({ allowsRecording: false });
    } catch {
      /* ignore */
    }

    if (!uri) {
      Alert.alert("Recording error", "No audio file was produced. Try again.");
      await hardClose();
      return;
    }

    const durationSeconds = recordingDurationSeconds(
      recorder,
      recordingStartedAtMsRef.current,
    );
    recordingStartedAtMsRef.current = null;

    if (durationSeconds < MIN_VOICE_RECORDING_SECONDS) {
      showToast({
        variant: "warning",
        message: VOICE_RECORDING_TOO_SHORT_MESSAGE,
      });
      await hardClose();
      return;
    }

    close();
    setPhase("idle");

    const { fileName, mimeType } = guessVoiceUploadMeta(uri);
    const capturedAt = new Date().toISOString();
    // One key per recording: the direct upload and a later outbox retry of it are the same capture.
    const idempotencyKey = randomUUID();

    showBusy("Uploading voice note…");

    try {
      const outcome = await sendOrQueue({
        isOnline: () => onlineManager.isOnline(),
        // No `capturedAt` on a live upload: the server stamps it with the request time, which is the
        // same moment (and cannot trip its clock-skew check on a device with a wrong clock).
        send: () =>
          submitVoice({ fileUri: uri, fileName, mimeType, idempotencyKey }),
        queue: async () => {
          if (!userId) {
            throw new Error("Sign in to add a transaction by voice.");
          }
          await enqueueCapture({
            userId,
            kind: "voice",
            sourceUri: uri,
            fileName,
            mimeType,
            idempotencyKey,
            capturedAt,
          });
        },
      });
      if (outcome.status === "queued") {
        showToast({
          variant: "info",
          message: "Saved. It will be read when you're back online.",
        });
      } else {
        showToast({
          variant: "success",
          message: "Voice transaction added",
        });
        // The row itself arrives through realtime once it is processed.
        invalidateOnboardingProgress(qc);
      }
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not save the transaction.";
      showToast({
        variant: "error",
        message: "Could not upload voice note",
      });
      Alert.alert("Something went wrong", message);
    } finally {
      hideBusy();
      invalidateLimitsQueries(qc);
    }
  }, [close, hardClose, hideBusy, qc, recorder, showBusy, showToast, userId]);

  const statusLine =
    phase === "recording"
      ? "Listening — tap stop when you are done"
      : "Getting ready…";

  return {
    phase,
    statusLine,
    stopAndSubmit,
    requestDismiss,
    stopEnabled: phase === "recording",
  };
}

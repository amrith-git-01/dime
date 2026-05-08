import { useSessionUserId } from "@/hooks/useSessionUserId";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";
import { useReceiptScanUiStore } from "@/stores/receiptScanUiStore";
import { useVoiceCaptureUiStore } from "@/stores/voiceCaptureUiStore";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";

import { submitVoice } from "../api/submitTransactionApi";
import { guessVoiceUploadMeta } from "../voice/guessVoiceMime";

type CapturePhase = "idle" | "preparing" | "recording";

function logVoice(step: string, extra?: Record<string, unknown>) {
  const payload = extra ? ` ${JSON.stringify(extra)}` : "";
  console.log(`[voice-capture] ${step}${payload}`);
}

export function useVoiceCaptureSession() {
  const visible = useVoiceCaptureUiStore((s) => s.visible);
  const close = useVoiceCaptureUiStore((s) => s.close);
  const { userId, authReady } = useSessionUserId();
  const showBusy = useReceiptScanUiStore((s) => s.show);
  const hideBusy = useReceiptScanUiStore((s) => s.hide);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [phase, setPhase] = useState<CapturePhase>("idle");
  const isRecordingRef = useRef(false);
  const sessionAbortRef = useRef(false);

  const cleanupRecording = useCallback(async () => {
    isRecordingRef.current = false;
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
    void triggerLightHaptic();
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
      logVoice("open");

      if (!authReady) {
        logVoice("wait-auth");
        return;
      }

      if (!userId) {
        logVoice("blocked-auth");
        Alert.alert(
          "Sign in required",
          "Sign in to add a transaction by voice.",
        );
        await hardClose();
        return;
      }

      logVoice("request-mic-permission");
      const perm = await requestRecordingPermissionsAsync();
      logVoice("mic-permission", {
        granted: perm.granted,
        status: perm.status,
      });

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
      } catch (e) {
        logVoice("audio-mode-error", {
          message: e instanceof Error ? e.message : String(e),
        });
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
        setPhase("recording");
        logVoice("recording-started");
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logVoice("record-start-error", { message });
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
  }, [visible, authReady, userId, cleanupRecording, hardClose, recorder]);

  const stopAndSubmit = useCallback(async () => {
    void triggerLightHaptic();
    if (!isRecordingRef.current) {
      return;
    }

    isRecordingRef.current = false;
    setPhase("preparing");

    let uri: string | null = null;
    try {
      await recorder.stop();
      uri = recorder.uri;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logVoice("stop-error", { message });
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
      logVoice("missing-uri");
      Alert.alert("Recording error", "No audio file was produced. Try again.");
      await hardClose();
      return;
    }

    close();
    setPhase("idle");

    const { fileName, mimeType } = guessVoiceUploadMeta(uri);
    logVoice("upload-start", { mimeType });

    showBusy("Uploading voice note…");

    try {
      await submitVoice({
        fileUri: uri,
        fileName,
        mimeType,
      });
      logVoice("queued");
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not save the transaction.";
      logVoice("error", { message });
      Alert.alert("Something went wrong", message);
    } finally {
      hideBusy();
    }
  }, [close, hardClose, hideBusy, recorder, showBusy]);

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

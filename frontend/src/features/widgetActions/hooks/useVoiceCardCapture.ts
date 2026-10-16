import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { submitVoice } from "@/features/transactions/api/submitTransactionApi";
import { guessVoiceUploadMeta } from "@/features/transactions/voice/guessVoiceMime";
import {
  MIN_VOICE_RECORDING_SECONDS,
  VOICE_RECORDING_TOO_SHORT_MESSAGE,
} from "@/features/transactions/voice/voiceCaptureConstants";
import { VOICE_RECORDING_OPTIONS } from "@/features/transactions/voice/voiceRecordingOptions";

import { runCapture, type CapturePhase } from "../utils/runCapture";
import { markCaptureFailed } from "../utils/settleCapture";
import { closeCard, useCloseAfterCapture } from "./useCardClose";

export type VoiceCardState = {
  /** `idle`: waiting for a tap to start (a launch that did not come from our own widget, or a recording that was dropped). */
  phase: "idle" | "preparing" | "recording" | CapturePhase;
  /** The pill's line after recording: "Reading voice note…", the result, or what went wrong. */
  text: string;
};

const MIC_DENIED_TEXT = "Allow microphone access to add by voice";
const MIC_FAILED_TEXT = "Couldn't start the microphone. Try again";
const RECORD_FAILED_TEXT = "Couldn't finish the recording. Try again";
const TICK_MS = 250;

/**
 * Voice: records while the pill is on screen (so no foreground service is needed), then sends the
 * clip and waits for the server to read it.
 * - `autoStart` false (a link without our token): nothing is recorded until the user taps Start.
 * - Leaving the card while recording (Home, another app) stops and drops the clip: a partial
 *   recording is never uploaded. Closing the card (Back, Cancel) does the same when the activity is destroyed.
 * - The Idempotency-Key is kept when the upload failed and replaced when the server's job failed
 *   (that key now belongs to the failed job, which the server would replay forever).
 */
export function useVoiceCardCapture(userId: string, autoStart: boolean) {
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const [state, setState] = useState<VoiceCardState>({
    phase: autoStart ? "preparing" : "idle",
    text: "",
  });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  const recordedUriRef = useRef<string | null>(null);
  const idempotencyKeyRef = useRef(randomUUID());

  const stopRecorder = useCallback(async () => {
    try {
      await recorder.stop();
    } catch {
      /* not recording */
    }
    try {
      await setAudioModeAsync({ allowsRecording: false });
    } catch {
      /* ignore */
    }
  }, [recorder]);

  const fail = useCallback(
    (text: string) => {
      markCaptureFailed({ userId, text });
      setState({ phase: "failed", text });
    },
    [userId],
  );

  const upload = useCallback(
    async (uri: string) => {
      const { fileName, mimeType } = guessVoiceUploadMeta(uri);
      const result = await runCapture({
        userId,
        kind: "voice",
        submit: () =>
          submitVoice({
            fileUri: uri,
            fileName,
            mimeType,
            idempotencyKey: idempotencyKeyRef.current,
          }),
        onPhase: (phase, text) => {
          if (!cancelledRef.current) {
            setState({ phase, text });
          }
        },
        isCancelled: () => cancelledRef.current,
      });
      if (result.failure === "job") {
        idempotencyKeyRef.current = randomUUID();
      }
    },
    [userId],
  );

  const begin = useCallback(async () => {
    cancelledRef.current = false;
    setState({ phase: "preparing", text: "" });
    setHint(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (cancelledRef.current) {
        return;
      }
      if (!permission.granted) {
        fail(MIC_DENIED_TEXT);
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: "duckOthers",
      });
      await recorder.prepareToRecordAsync();
      if (cancelledRef.current) {
        await stopRecorder();
        return;
      }
      recorder.record();
      startedAtRef.current = Date.now();
      setElapsedSeconds(0);
      setState({ phase: "recording", text: "" });
    } catch {
      if (!cancelledRef.current) {
        fail(MIC_FAILED_TEXT);
      }
    }
  }, [fail, recorder, stopRecorder]);

  useEffect(() => {
    cancelledRef.current = false;
    if (autoStart) {
      void begin();
    }
    return () => {
      cancelledRef.current = true;
      void stopRecorder();
    };
  }, [autoStart, begin, stopRecorder]);

  const recording = state.phase === "recording";

  useEffect(() => {
    if (!recording) {
      return;
    }
    const timer = setInterval(() => {
      const startedAt = startedAtRef.current;
      if (startedAt !== null) {
        setElapsedSeconds((Date.now() - startedAt) / 1000);
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [recording]);

  // Home, the app switcher or another app: stop and throw the clip away, never upload part of it.
  useEffect(() => {
    if (!recording) {
      return;
    }
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        return;
      }
      startedAtRef.current = null;
      setState({ phase: "idle", text: "" });
      void stopRecorder();
      closeCard();
    });
    return () => subscription.remove();
  }, [recording, stopRecorder]);

  const stop = useCallback(async () => {
    const startedAt = startedAtRef.current;
    if (state.phase !== "recording" || startedAt === null) {
      return;
    }
    // Too short to read: keep recording rather than throwing the clip away.
    if ((Date.now() - startedAt) / 1000 < MIN_VOICE_RECORDING_SECONDS) {
      setHint(VOICE_RECORDING_TOO_SHORT_MESSAGE);
      return;
    }
    setHint(null);
    setState({ phase: "uploading", text: "Uploading…" });
    startedAtRef.current = null;
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      const uri = recorder.uri;
      if (!uri) {
        fail(RECORD_FAILED_TEXT);
        return;
      }
      recordedUriRef.current = uri;
      await upload(uri);
    } catch {
      if (!cancelledRef.current) {
        fail(RECORD_FAILED_TEXT);
      }
    }
  }, [fail, recorder, state.phase, upload]);

  const retry = useCallback(() => {
    const uri = recordedUriRef.current;
    if (uri) {
      void upload(uri);
    } else {
      void begin();
    }
  }, [begin, upload]);

  useCloseAfterCapture(
    state.phase === "idle" || state.phase === "preparing" || state.phase === "recording"
      ? null
      : state.phase,
  );

  return { ...state, elapsedSeconds, hint, start: begin, stop, retry, cancel: closeCard };
}

/** Minimum voice clip length before upload / AI parse (audit 5.3). */
export const MIN_VOICE_RECORDING_SECONDS = 3;

export const MIN_VOICE_RECORDING_MS = MIN_VOICE_RECORDING_SECONDS * 1000;

export const VOICE_RECORDING_TOO_SHORT_MESSAGE =
  "Recording too short — keep talking for at least 3 seconds";

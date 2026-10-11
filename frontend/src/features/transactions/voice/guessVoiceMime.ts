/**
 * Derive upload filename and MIME from a local recording URI.
 * Recordings are AAC in `.m4a` on both platforms (see `VOICE_RECORDING_OPTIONS`); the other
 * branches only cover files picked or recorded elsewhere. Unsupported containers such as
 * `.caf` keep their real extension so the server reports a clear error instead of mislabeling.
 */
export function guessVoiceUploadMeta(uri: string): {
  fileName: string;
  mimeType: string;
} {
  const path = uri.split("?")[0]?.toLowerCase() ?? "";

  if (path.endsWith(".wav")) {
    return { fileName: "voice.wav", mimeType: "audio/wav" };
  }
  if (path.endsWith(".mp3")) {
    return { fileName: "voice.mp3", mimeType: "audio/mpeg" };
  }
  if (path.endsWith(".webm")) {
    return { fileName: "voice.webm", mimeType: "audio/webm" };
  }
  if (path.endsWith(".ogg")) {
    return { fileName: "voice.ogg", mimeType: "audio/ogg" };
  }
  if (path.endsWith(".flac")) {
    return { fileName: "voice.flac", mimeType: "audio/flac" };
  }
  if (path.endsWith(".caf")) {
    return { fileName: "voice.caf", mimeType: "audio/x-caf" };
  }
  if (path.endsWith(".mp4")) {
    return { fileName: "voice.mp4", mimeType: "audio/mp4" };
  }

  // `.m4a` (the recording format) and anything unknown.
  return { fileName: "voice.m4a", mimeType: "audio/mp4" };
}

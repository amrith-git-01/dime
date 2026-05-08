/** Derive upload filename and MIME from a local recording URI (expo-audio / platform-specific). */
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
  if (path.endsWith(".mp4") || path.endsWith(".m4a") || path.endsWith(".caf")) {
    return { fileName: "voice.m4a", mimeType: "audio/mp4" };
  }

  return { fileName: "voice.m4a", mimeType: "audio/m4a" };
}

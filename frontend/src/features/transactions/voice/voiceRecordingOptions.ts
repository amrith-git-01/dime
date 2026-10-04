import {
  AudioQuality,
  IOSOutputFormat,
  type RecordingOptions,
} from "expo-audio";

/**
 * Voice-note recording format. The audio is sent to the server as recorded (no transcoding),
 * and the speech-to-text API accepts m4a/mp4/mp3/wav/webm/ogg/flac but NOT caf. So both
 * platforms record AAC in an `.m4a` (MPEG-4) container. Mono at a speech bitrate keeps the
 * upload small.
 */
export const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  extension: ".m4a",
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 64000,
  android: {
    extension: ".m4a",
    outputFormat: "mpeg4",
    audioEncoder: "aac",
  },
  ios: {
    extension: ".m4a",
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.HIGH,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 64000,
  },
};

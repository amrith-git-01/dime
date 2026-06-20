/** Parses `[sender, body]` string emitted by @maniac-tech/react-native-expo-read-sms. */
export function parseExpoReadSmsPayload(
  raw: string,
): { sender: string; body: string } | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return null;
  }
  const inner = trimmed.slice(1, -1);
  const commaIndex = inner.indexOf(", ");
  if (commaIndex === -1) {
    return null;
  }
  const sender = inner.slice(0, commaIndex).trim();
  const body = inner.slice(commaIndex + 2).trim();
  if (!body) {
    return null;
  }
  return { sender, body };
}

import { collectKeptSms } from "./smsMatcher";
import { SMS_SESSION_CAP, type InboxSms } from "./smsTypes";

export type SmsGateResult =
  | { kind: "skip" }
  | { kind: "review"; kept: InboxSms[] }
  | { kind: "zero-kept"; nextWatermarkMs: number };

export function decideSmsGate(input: {
  toggleOn: boolean;
  permissionGranted: boolean;
  watermarkMs: number | null;
  inbox: InboxSms[];
  cap?: number;
}): SmsGateResult {
  if (
    !input.toggleOn ||
    !input.permissionGranted ||
    input.watermarkMs == null
  ) {
    return { kind: "skip" };
  }

  const newer = input.inbox.filter((row) => row.dateMs > input.watermarkMs!);
  const { kept, inspectedMaxDateMs } = collectKeptSms(
    newer,
    input.cap ?? SMS_SESSION_CAP,
  );

  if (kept.length > 0) {
    return { kind: "review", kept };
  }
  if (inspectedMaxDateMs != null) {
    return { kind: "zero-kept", nextWatermarkMs: inspectedMaxDateMs };
  }
  return { kind: "skip" };
}

export function lastShownWatermarkMs(shown: InboxSms[]): number | null {
  if (shown.length === 0) {
    return null;
  }
  let max = shown[0].dateMs;
  for (const row of shown) {
    if (row.dateMs > max) {
      max = row.dateMs;
    }
  }
  return max;
}

/** Review screen only after the scan finds kept SMS — never during idle/scan. */
export function shouldHoldSmsReviewRoute(
  scanEnabled: boolean,
  phase: "idle" | "scanning" | "review" | "done",
): boolean {
  return scanEnabled && phase === "review";
}

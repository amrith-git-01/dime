import { isAxiosError } from "axios";

import { dimeApi } from "@/lib/api/dimeApi";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

type AcceptedResponse = {
  accepted: boolean;
};

export type SubmitSmsCaptureInput = {
  text: string;
  receivedAt?: string;
  sender?: string;
};

function parseSubmitError(e: unknown): Error {
  if (!isAxiosError(e)) {
    return e instanceof Error ? e : new Error("SMS capture request failed");
  }
  const body = e.response?.data;
  if (typeof body === "string" && body.trim().length > 0) {
    return new Error(body);
  }
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") {
      return new Error(detail);
    }
    return new Error(JSON.stringify(detail));
  }
  return new Error(e.message.length > 0 ? e.message : "SMS capture failed");
}

export async function submitSmsCapture(
  input: SubmitSmsCaptureInput,
): Promise<void> {
  try {
    await dimeApi.post<AcceptedResponse>(
      "/api/v1/transactions/sms",
      {
        text: input.text,
        received_at: input.receivedAt,
        sender: input.sender,
      },
      {
        params: { timezone: getDeviceIanaTimezone() },
        timeout: 30_000,
      },
    );
  } catch (e) {
    throw parseSubmitError(e);
  }
}

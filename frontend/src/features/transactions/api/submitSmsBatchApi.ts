import { randomUUID } from "expo-crypto";

import { dimeApi } from "@/lib/api/dimeApi";
import { parseFastApiError } from "@/lib/api/parseFastApiError";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

type AcceptedResponse = {
  accepted: boolean;
};

export type SmsBatchMessage = {
  body: string;
  received_at: string;
};

export async function submitSmsBatch(
  messages: SmsBatchMessage[],
  idempotencyKey: string = randomUUID(),
): Promise<void> {
  try {
    await dimeApi.post<AcceptedResponse>(
      "/api/v1/transactions/sms",
      { messages },
      {
        params: { timezone: getDeviceIanaTimezone() },
        headers: { "Idempotency-Key": idempotencyKey },
      },
    );
  } catch (error) {
    throw new Error(parseFastApiError(error));
  }
}

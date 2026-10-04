import { isAxiosError } from "axios";
import { randomUUID } from "expo-crypto";

import {
  dimeApi,
  getDimeApiBaseUrl,
  getDimeAuthHeaders,
  refreshDimeAuthHeaders,
} from "@/lib/api/dimeApi";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import type { CreateTransactionBody } from "./transactionsApi";

type AcceptedResponse = {
  accepted: boolean;
};

/** Server dedupes on this header (C2): one key per capture, reused on every retry of it. */
export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";

/** Receipt/voice uploads fail fast; the server accepts the file and processes it in the background. */
const UPLOAD_TIMEOUT_MS = 60_000;

type SubmitFileInput = {
  path: "/api/v1/transactions/receipt" | "/api/v1/transactions/voice";
  fileUri: string;
  fileName: string;
  mimeType: string;
  idempotencyKey: string;
};

function normalizeLocalFileUri(uri: string): string {
  const trimmed = uri.trim();
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("/")) {
    return `file://${trimmed}`;
  }
  return trimmed;
}

function parseSubmitError(e: unknown): Error {
  if (!isAxiosError(e)) {
    return e instanceof Error ? e : new Error("Submission request failed");
  }
  const status = e.response?.status;
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

  if (e.code === "ECONNABORTED") {
    return new Error("Request timed out. Try again.");
  }

  return new Error(
    e.message.length > 0 ? e.message : `Submission failed (${status ?? "?"})`,
  );
}

function buildUploadForm(input: SubmitFileInput): FormData {
  const form = new FormData();
  form.append("file", {
    uri: normalizeLocalFileUri(input.fileUri),
    name: input.fileName,
    type: input.mimeType,
  } as unknown as Blob);
  return form;
}

async function postFileWithFetch(
  input: SubmitFileInput,
  authHeaders: Record<string, string>,
): Promise<Response> {
  const base = getDimeApiBaseUrl();
  const url = `${base}${input.path}?${timezoneQuerySuffix()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders,
        [IDEMPOTENCY_KEY_HEADER]: input.idempotencyKey,
      },
      body: buildUploadForm(input),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fallback for RN FormData + axios XHR network errors. Reuses the same Idempotency-Key so a
 * request that actually reached the server is not duplicated, and refreshes the token on 401.
 */
async function submitFileWithFetch(input: SubmitFileInput): Promise<void> {
  if (!getDimeApiBaseUrl()) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL is not set");
  }

  let response = await postFileWithFetch(input, await getDimeAuthHeaders());
  if (response.status === 401) {
    const refreshed = await refreshDimeAuthHeaders();
    if (refreshed.Authorization) {
      response = await postFileWithFetch(input, refreshed);
    }
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      text.length > 0 ? text : `Submission failed (${response.status})`,
    );
  }
}

function timezoneQuerySuffix(): string {
  return `timezone=${encodeURIComponent(getDeviceIanaTimezone())}`;
}

async function submitFile(input: SubmitFileInput): Promise<void> {
  if (!getDimeApiBaseUrl()) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL is not set");
  }

  try {
    await dimeApi.post<AcceptedResponse>(input.path, buildUploadForm(input), {
      timeout: UPLOAD_TIMEOUT_MS,
      params: { timezone: getDeviceIanaTimezone() },
      headers: { [IDEMPOTENCY_KEY_HEADER]: input.idempotencyKey },
    });
  } catch (e) {
    if (isAxiosError(e) && e.code === "ERR_NETWORK") {
      try {
        await submitFileWithFetch(input);
        return;
      } catch (fallbackError) {
        throw parseSubmitError(fallbackError);
      }
    }
    throw parseSubmitError(e);
  }
}

export async function submitManualTransaction(
  body: CreateTransactionBody,
  idempotencyKey: string = randomUUID(),
): Promise<void> {
  try {
    await dimeApi.post<AcceptedResponse>("/api/v1/transactions", body, {
      params: { timezone: getDeviceIanaTimezone() },
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    });
  } catch (e) {
    throw parseSubmitError(e);
  }
}

type SubmitCaptureFileInput = {
  fileUri: string;
  fileName: string;
  mimeType: string;
  /** Generate once per capture and pass the same key on retry. */
  idempotencyKey?: string;
};

export async function submitReceipt(
  input: SubmitCaptureFileInput,
): Promise<void> {
  await submitFile({
    path: "/api/v1/transactions/receipt",
    ...input,
    idempotencyKey: input.idempotencyKey ?? randomUUID(),
  });
}

export async function submitVoice(input: SubmitCaptureFileInput): Promise<void> {
  await submitFile({
    path: "/api/v1/transactions/voice",
    ...input,
    idempotencyKey: input.idempotencyKey ?? randomUUID(),
  });
}

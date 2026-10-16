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
  /** The created (or already existing) transaction. Absent when replaying a response stored before ids existed. */
  id?: string;
  /** False when the payment already existed (a duplicate). Absent in replays stored before it existed. */
  created?: boolean;
  /** Receipt / voice uploads: the queued job, polled on `GET /api/v1/ingest/jobs/:id`. */
  job_id?: string | null;
};

/** What an accepted receipt / voice upload returns. `jobId` is null when the server did not name a job. */
export type SubmittedCapture = { jobId: string | null };

function jobIdOf(data: AcceptedResponse | null | undefined): string | null {
  return typeof data?.job_id === "string" && data.job_id.length > 0 ? data.job_id : null;
}

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
async function submitFileWithFetch(input: SubmitFileInput): Promise<SubmittedCapture> {
  if (!getDimeApiBaseUrl()) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL is not set");
  }

  const sentHeaders = await getDimeAuthHeaders();
  let response = await postFileWithFetch(input, sentHeaders);
  if (response.status === 401) {
    const refreshed = await refreshDimeAuthHeaders(sentHeaders);
    if (refreshed.Authorization) {
      response = await postFileWithFetch(input, refreshed);
    }
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      messageFromErrorText(text) ?? `Submission failed (${response.status})`,
    );
  }
  const accepted = (await response.json().catch(() => null)) as AcceptedResponse | null;
  return { jobId: jobIdOf(accepted) };
}

/** Server error bodies are `{detail}` JSON (e.g. a 429 limit message); show the detail, not the JSON. */
function messageFromErrorText(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    const detail =
      typeof parsed === "object" && parsed !== null
        ? (parsed as { detail?: unknown }).detail
        : undefined;
    if (typeof detail === "string" && detail.trim().length > 0) {
      return detail.trim();
    }
  } catch {
    /* plain-text body */
  }
  return trimmed;
}

function timezoneQuerySuffix(): string {
  return `timezone=${encodeURIComponent(getDeviceIanaTimezone())}`;
}

async function submitFile(input: SubmitFileInput): Promise<SubmittedCapture> {
  if (!getDimeApiBaseUrl()) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL is not set");
  }

  try {
    const { data } = await dimeApi.post<AcceptedResponse>(
      input.path,
      buildUploadForm(input),
      {
        timeout: UPLOAD_TIMEOUT_MS,
        params: { timezone: getDeviceIanaTimezone() },
        headers: { [IDEMPOTENCY_KEY_HEADER]: input.idempotencyKey },
      },
    );
    return { jobId: jobIdOf(data) };
  } catch (e) {
    if (isAxiosError(e) && e.code === "ERR_NETWORK") {
      try {
        return await submitFileWithFetch(input);
      } catch (fallbackError) {
        throw parseSubmitError(fallbackError);
      }
    }
    throw parseSubmitError(e);
  }
}

type PostManualOptions = {
  /** Per-request timeout in ms (the default is the client's 45 s). */
  timeout?: number;
  signal?: AbortSignal;
};

/**
 * Posts a manual transaction and returns the server's id for it, and whether it was newly created, when it sends them. Axios errors
 * are left as they are so callers can branch on the status (the home-screen widgets do).
 */
export async function postManualTransaction(
  body: CreateTransactionBody,
  idempotencyKey: string,
  options: PostManualOptions = {},
): Promise<{ id?: string; created?: boolean }> {
  const { data } = await dimeApi.post<AcceptedResponse>(
    "/api/v1/transactions",
    body,
    {
      params: { timezone: getDeviceIanaTimezone() },
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      ...(options.timeout !== undefined ? { timeout: options.timeout } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    },
  );
  return {
    ...(typeof data?.id === "string" ? { id: data.id } : {}),
    ...(typeof data?.created === "boolean" ? { created: data.created } : {}),
  };
}

export async function submitManualTransaction(
  body: CreateTransactionBody,
  idempotencyKey: string = randomUUID(),
): Promise<void> {
  try {
    await postManualTransaction(body, idempotencyKey);
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
): Promise<SubmittedCapture> {
  return submitFile({
    path: "/api/v1/transactions/receipt",
    ...input,
    idempotencyKey: input.idempotencyKey ?? randomUUID(),
  });
}

export async function submitVoice(
  input: SubmitCaptureFileInput,
): Promise<SubmittedCapture> {
  return submitFile({
    path: "/api/v1/transactions/voice",
    ...input,
    idempotencyKey: input.idempotencyKey ?? randomUUID(),
  });
}

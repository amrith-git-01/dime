import { isAxiosError } from "axios";
import { randomUUID } from "expo-crypto";

import { getSession } from "@/lib/auth/session";
import { SessionChangedError, SubmitError } from "@/lib/outbox/failure";
import {
  dimeApi,
  getDimeApiBaseUrl,
  getDimeAuthHeaders,
  refreshDimeAuthHeaders,
} from "@/lib/api/dimeApi";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import type { TransactionRow } from "../types";
import type { CreateTransactionBody } from "./transactionsApi";

type AcceptedResponse = {
  accepted: boolean;
  /** The created (or already existing) transaction. Absent when replaying a response stored before ids existed. */
  id?: string;
  /** False when the payment already existed (a duplicate). Absent in replays stored before it existed. */
  created?: boolean;
  /** The saved row (list-item shape). Absent from servers / replays that predate it. */
  transaction?: TransactionRow;
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
  /** ISO instant of the capture (the server stamps the transaction with it); defaults to the request time. */
  capturedAt?: string;
  /** IANA timezone the capture was made in; defaults to the device's. */
  timezone?: string;
  /** Outbox only: the user it belongs to (refused when someone else is signed in) and the wipe's abort signal. */
  outboxUserId?: string;
  signal?: AbortSignal;
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
  if (e instanceof SubmitError) {
    return e;
  }
  if (!isAxiosError(e)) {
    if (e instanceof Error) {
      // fetch's own failures (offline, aborted by the timeout) never reached the server.
      return e.name === "AbortError" ||
        (e instanceof TypeError && /network request failed|failed to fetch/i.test(e.message))
        ? new SubmitError(e.message, { networkFailure: true })
        : e;
    }
    return new Error("Submission request failed");
  }
  const status = e.response?.status;
  const body = e.response?.data;
  const retryAfter = Number(e.response?.headers?.["retry-after"]);
  const bodyCode =
    body && typeof body === "object" && typeof (body as { code?: unknown }).code === "string"
      ? (body as { code: string }).code
      : undefined;
  const options = {
    ...(bodyCode ? { code: bodyCode } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(Number.isFinite(retryAfter) && retryAfter > 0
      ? { retryAfterSeconds: retryAfter }
      : {}),
    networkFailure: !e.response,
  };

  if (typeof body === "string" && body.trim().length > 0) {
    return new SubmitError(body, options);
  }

  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") {
      return new SubmitError(detail, options);
    }
    return new SubmitError(JSON.stringify(detail), options);
  }

  if (e.code === "ECONNABORTED" || e.code === "ETIMEDOUT") {
    return new SubmitError("Request timed out. Try again.", {
      ...options,
      networkFailure: true,
    });
  }

  return new SubmitError(
    e.message.length > 0 ? e.message : `Submission failed (${status ?? "?"})`,
    options,
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
  const url = `${base}${input.path}?${captureQuerySuffix(input)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  const onWipe = () => controller.abort();
  input.signal?.addEventListener("abort", onWipe);

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
    input.signal?.removeEventListener("abort", onWipe);
  }
}

/** Outbox uploads only go out as the user they were made for. */
function assertOutboxUser(input: SubmitFileInput): void {
  if (input.outboxUserId && getSession()?.user.id !== input.outboxUserId) {
    throw new SessionChangedError();
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

  assertOutboxUser(input);
  const sentHeaders = await getDimeAuthHeaders();
  assertOutboxUser(input);
  let response = await postFileWithFetch(input, sentHeaders);
  if (response.status === 401) {
    assertOutboxUser(input);
    const refreshed = await refreshDimeAuthHeaders(sentHeaders);
    assertOutboxUser(input);
    if (refreshed.Authorization) {
      response = await postFileWithFetch(input, refreshed);
    }
  }

  if (!response.ok) {
    const text = await response.text();
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new SubmitError(
      messageFromErrorText(text) ?? `Submission failed (${response.status})`,
      {
        status: response.status,
        ...(Number.isFinite(retryAfter) && retryAfter > 0
          ? { retryAfterSeconds: retryAfter }
          : {}),
      },
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

function captureQuerySuffix(input: SubmitFileInput): string {
  const params = [
    `timezone=${encodeURIComponent(input.timezone ?? getDeviceIanaTimezone())}`,
  ];
  if (input.capturedAt) {
    params.push(`captured_at=${encodeURIComponent(input.capturedAt)}`);
  }
  return params.join("&");
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
        params: {
          timezone: input.timezone ?? getDeviceIanaTimezone(),
          ...(input.capturedAt ? { captured_at: input.capturedAt } : {}),
        },
        headers: { [IDEMPOTENCY_KEY_HEADER]: input.idempotencyKey },
        ...(input.outboxUserId ? { _outboxUserId: input.outboxUserId } : {}),
        ...(input.signal ? { signal: input.signal } : {}),
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
  /** IANA timezone to send (the outbox replays with the one the entry was made in); defaults to the device's. */
  timezone?: string;
  /** Outbox only: the user it belongs to (refused when someone else is signed in). */
  outboxUserId?: string;
};

/** What an accepted manual add returns; `transaction` is absent from servers that predate it. */
export type PostedManualTransaction = {
  id?: string;
  created?: boolean;
  transaction?: TransactionRow;
};

/**
 * Posts a manual transaction and returns the server's id for it, and whether it was newly created, when it sends them. Axios errors
 * are left as they are so callers can branch on the status (the home-screen widgets do).
 */
export async function postManualTransaction(
  body: CreateTransactionBody,
  idempotencyKey: string,
  options: PostManualOptions = {},
): Promise<PostedManualTransaction> {
  const { data } = await dimeApi.post<AcceptedResponse>(
    "/api/v1/transactions",
    body,
    {
      params: { timezone: options.timezone ?? getDeviceIanaTimezone() },
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      ...(options.timeout !== undefined ? { timeout: options.timeout } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.outboxUserId ? { _outboxUserId: options.outboxUserId } : {}),
    },
  );
  return {
    ...(typeof data?.id === "string" ? { id: data.id } : {}),
    ...(typeof data?.created === "boolean" ? { created: data.created } : {}),
    ...(isSavedRow(data?.transaction) ? { transaction: data.transaction } : {}),
  };
}

function isSavedRow(value: unknown): value is TransactionRow {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { transaction_at?: unknown }).transaction_at === "string"
  );
}

export async function submitManualTransaction(
  body: CreateTransactionBody,
  idempotencyKey: string = randomUUID(),
  options: PostManualOptions = {},
): Promise<PostedManualTransaction> {
  try {
    return await postManualTransaction(body, idempotencyKey, options);
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
  /** ISO instant the capture was made (the outbox sends the original time of a queued one). */
  capturedAt?: string;
  timezone?: string;
  /** Outbox only: the user it belongs to and the wipe's abort signal (see `SubmitFileInput`). */
  outboxUserId?: string;
  signal?: AbortSignal;
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

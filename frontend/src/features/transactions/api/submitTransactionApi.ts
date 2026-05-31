import { isAxiosError } from "axios";

import {
  dimeApi,
  getDimeApiBaseUrl,
  getDimeAuthHeaders,
} from "@/lib/api/dimeApi";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import type { CreateTransactionBody } from "./transactionsApi";

type AcceptedResponse = {
  accepted: boolean;
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

async function submitFileWithFetch(input: {
  path: "/api/v1/transactions/receipt" | "/api/v1/transactions/voice";
  fileUri: string;
  fileName: string;
  mimeType: string;
}): Promise<void> {
  const base = getDimeApiBaseUrl();
  if (!base) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL is not set");
  }

  const url = `${base}${input.path}?${timezoneQuerySuffix()}`;
  const headers = await getDimeAuthHeaders();

  const form = new FormData();
  form.append("file", {
    uri: normalizeLocalFileUri(input.fileUri),
    name: input.fileName,
    type: input.mimeType,
  } as unknown as Blob);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300_000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: form,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        text.length > 0 ? text : `Submission failed (${response.status})`,
      );
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

function timezoneQuerySuffix(): string {
  return `timezone=${encodeURIComponent(getDeviceIanaTimezone())}`;
}

async function submitFile(input: {
  path: "/api/v1/transactions/receipt" | "/api/v1/transactions/voice";
  fileUri: string;
  fileName: string;
  mimeType: string;
}): Promise<void> {
  if (!getDimeApiBaseUrl()) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL is not set");
  }

  const form = new FormData();
  form.append("file", {
    uri: normalizeLocalFileUri(input.fileUri),
    name: input.fileName,
    type: input.mimeType,
  } as unknown as Blob);

  try {
    await dimeApi.post<AcceptedResponse>(input.path, form, {
      timeout: 300_000,
      params: { timezone: getDeviceIanaTimezone() },
    });
  } catch (e) {
    if (isAxiosError(e) && e.code === "ERR_NETWORK") {
      await submitFileWithFetch(input);
      return;
    }
    throw parseSubmitError(e);
  }
}

export async function submitManualTransaction(
  body: CreateTransactionBody,
): Promise<void> {
  try {
    await dimeApi.post<AcceptedResponse>("/api/v1/transactions", body, {
      params: { timezone: getDeviceIanaTimezone() },
    });
  } catch (e) {
    throw parseSubmitError(e);
  }
}

export async function submitReceipt(input: {
  fileUri: string;
  fileName: string;
  mimeType: string;
}): Promise<void> {
  await submitFile({
    path: "/api/v1/transactions/receipt",
    ...input,
  });
}

export async function submitVoice(input: {
  fileUri: string;
  fileName: string;
  mimeType: string;
}): Promise<void> {
  await submitFile({
    path: "/api/v1/transactions/voice",
    ...input,
  });
}

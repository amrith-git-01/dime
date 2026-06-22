import { Platform } from "react-native";

import type { InboxSms } from "./smsTypes";

type PermissionStatus = "granted" | "denied" | "unavailable";

type RawInboxRow = {
  raw?: {
    id?: string | number;
    address?: string;
    body?: string;
    date?: number;
  };
};

export async function ensureSmsReadPermission(): Promise<PermissionStatus> {
  if (Platform.OS !== "android") {
    return "unavailable";
  }
  try {
    const mod = await import("expo-transaction-sms-reader");
    const status = await mod.ensurePermissionsAsync();
    if (status === "granted") {
      return "granted";
    }
    return "denied";
  } catch (error) {
    console.warn("[sms] permission module unavailable", error);
    return "unavailable";
  }
}

export async function queryInboxSince(
  watermarkMs: number,
): Promise<InboxSms[]> {
  if (Platform.OS !== "android") {
    return [];
  }
  try {
    const mod = await import("expo-transaction-sms-reader");
    const rows = (await mod.getRecentMessages({
      sinceTimestamp: watermarkMs,
      onlyTransactions: false,
      limit: 500,
    })) as RawInboxRow[];
    const mapped: InboxSms[] = [];
    for (const row of rows) {
      const raw = row.raw;
      if (!raw) {
        continue;
      }
      const body = typeof raw.body === "string" ? raw.body : "";
      const address = typeof raw.address === "string" ? raw.address : "";
      const dateMs = typeof raw.date === "number" ? raw.date : 0;
      if (!body || dateMs <= watermarkMs) {
        continue;
      }
      mapped.push({
        id: String(raw.id ?? `${address}-${dateMs}`),
        address,
        body,
        dateMs,
      });
    }
    mapped.sort((a, b) => a.dateMs - b.dateMs);
    return mapped;
  } catch (error) {
    console.warn("[sms] inbox query failed", error);
    throw error;
  }
}

import { randomUUID } from "expo-crypto";

export const OPTIMISTIC_MANUAL_TRANSACTION_ID_PREFIX = "optimistic-manual-";

export function isOptimisticTransactionId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_MANUAL_TRANSACTION_ID_PREFIX);
}

export function createOptimisticManualTransactionId(): string {
  return `${OPTIMISTIC_MANUAL_TRANSACTION_ID_PREFIX}${randomUUID()}`;
}

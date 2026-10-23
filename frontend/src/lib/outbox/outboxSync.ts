import NetInfo from "@react-native-community/netinfo";
import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { AppState } from "react-native";

import type {
  PostedManualTransaction,
  SubmittedCapture,
} from "@/features/transactions/api/submitTransactionApi";
import {
  submitManualTransaction,
  submitReceipt,
  submitVoice,
} from "@/features/transactions/api/submitTransactionApi";
import { invalidateLimitsQueries } from "@/features/limits/cache/invalidateLimitsQueries";
import { invalidateOnboardingProgress } from "@/features/onboarding/cache/invalidateOnboardingProgress";
import {
  invalidateTransactionAggregates,
  invalidateTransactionDerivedQueries,
} from "@/features/transactions/cache/invalidateTransactionQueries";
import { applyTransactionInsertToListCaches } from "@/features/transactions/cache/transactionListCache";
import { recentTransactionMutations } from "@/features/transactions/utils/recentMutationTracker";
import { reportError } from "@/lib/reportError";
import { useAuthSessionStore } from "@/stores/authSessionStore";
import { useConnectivityStore } from "@/stores/connectivityStore";
import { useOutboxStore } from "@/stores/outboxStore";
import { currentUserDataEpoch, trackAbortable } from "@/lib/userDataEpoch";

import { classifyFailure, SubmitError } from "./failure";
import { deleteOutboxFile, outboxFileExists, pruneOrphanOutboxFiles } from "./outboxFiles";
import {
  deferUntil,
  earliestAttemptAt,
  isDue,
  isTooOld,
  itemAfterFailure,
  TOO_OLD_MESSAGE,
} from "./outboxPolicy";
import type { OutboxItem } from "./outboxTypes";

/** A manual add is sent with this timeout from the outbox as well, so one dead connection cannot stall the line for 45 s. */
const SEND_TIMEOUT_MS = 20_000;

/** Never sooner than this, so a due-now timer cannot spin. */
const MIN_TIMER_MS = 1_000;

/** Who an upload is for, and the signal a wipe uses to cancel it. */
export type SendContext = { userId: string; signal: AbortSignal };

export type OutboxSyncDeps = {
  now: () => number;
  isOnline: () => boolean;
  sendManual: (item: OutboxItem, context: SendContext) => Promise<PostedManualTransaction>;
  sendCapture: (item: OutboxItem, context: SendContext) => Promise<SubmittedCapture>;
  fileExists: (uri: string) => Promise<boolean>;
  deleteFile: (uri: string | undefined) => Promise<void>;
  /** The item reached the server: patch caches / refresh queries. */
  onSynced: (item: OutboxItem, result: PostedManualTransaction | SubmittedCapture) => void;
};

/**
 * The drain: FIFO, one upload at a time, single-flight. A call while a drain runs makes it take
 * another pass when it finishes (so an item queued meanwhile is not missed). One failing item does
 * not block the rest; a dead connection ends the pass and gives the others the same wait.
 */
export function createOutboxDrain(deps: OutboxSyncDeps) {
  let running: Promise<void> | null = null;
  let again = false;

  async function pass(): Promise<void> {
    const store = useOutboxStore.getState();
    if (!store.userId || !deps.isOnline()) {
      return;
    }
    const attempted = new Set<string>();
    for (;;) {
      const now = deps.now();
      const item = useOutboxStore
        .getState()
        .items.find((candidate) => !attempted.has(candidate.id) && isDue(candidate, now));
      if (!item) {
        return;
      }
      attempted.add(item.id);
      const stop = await attempt(item);
      if (stop || !deps.isOnline()) {
        return;
      }
    }
  }

  /** Returns true when the pass should end (the connection looks dead, or the account changed under it). */
  async function attempt(item: OutboxItem): Promise<boolean> {
    const outbox = useOutboxStore.getState();
    const userId = outbox.userId;
    if (!userId) {
      return true;
    }
    // A sign-out / user switch during any await below wipes the data and bumps the epoch: from then
    // on this attempt belongs to nobody, and must not touch caches, the store or the network.
    const epoch = currentUserDataEpoch();
    const stale = () =>
      epoch !== currentUserDataEpoch() || useOutboxStore.getState().userId !== userId;
    if (isTooOld(item, deps.now())) {
      outbox.update(item.id, (current) => ({
        ...current,
        status: "failed",
        nextAttemptAt: null,
        lastError: TOO_OLD_MESSAGE,
      }));
      return false;
    }
    outbox.update(item.id, (current) => ({ ...current, status: "sending" }));
    const controller = new AbortController();
    const untrack = trackAbortable(controller);
    const context: SendContext = { userId, signal: controller.signal };
    try {
      if (item.kind === "manual") {
        const result = await deps.sendManual(item, context);
        if (stale()) {
          return true;
        }
        deps.onSynced(item, result);
        useOutboxStore.getState().remove(item.id);
        return false;
      }
      if (!item.file || !(await deps.fileExists(item.file.uri))) {
        if (stale()) {
          return true;
        }
        useOutboxStore.getState().update(item.id, (current) => ({
          ...current,
          status: "failed",
          nextAttemptAt: null,
          lastError: "The saved recording or photo is no longer on this device.",
        }));
        return false;
      }
      const result = await deps.sendCapture(item, context);
      if (stale()) {
        return true;
      }
      deps.onSynced(item, result);
      useOutboxStore.getState().remove(item.id);
      await deps.deleteFile(item.file.uri);
      return false;
    } catch (error) {
      if (stale()) {
        return true;
      }
      const failure = classifyFailure(error);
      const now = deps.now();
      let nextAttemptAt: number | null = null;
      useOutboxStore.getState().update(item.id, (current) => {
        const next = itemAfterFailure(current, failure, now);
        nextAttemptAt = next.nextAttemptAt;
        return next;
      });
      if (failure.offline && nextAttemptAt !== null) {
        const wait: number = nextAttemptAt;
        useOutboxStore
          .getState()
          .updateAll((other) =>
            other.id !== item.id && (other.status === "queued" || other.status === "blocked")
              ? deferUntil(other, wait)
              : other,
          );
        return true;
      }
      if (failure.kind === "fatal") {
        // Not an outage: the server answered. Worth a line in the logs, never a crash.
        reportError(error, "outbox item refused by the server");
      }
      return false;
    } finally {
      untrack();
    }
  }

  return {
    /** Runs a drain (or asks the running one to take another pass). Resolves when it is idle. */
    drain(): Promise<void> {
      if (running) {
        again = true;
        return running;
      }
      running = (async () => {
        useOutboxStore.getState().setSyncing(true);
        try {
          do {
            again = false;
            await pass();
          } while (again);
        } catch (error) {
          reportError(error, "outbox drain failed");
        } finally {
          useOutboxStore.getState().setSyncing(false);
          running = null;
        }
      })();
      return running;
    },
  };
}

/* -------------------------------------------------------------------------------------------- *
 * The app's instance: real network, real caches, and the triggers that wake it.
 * -------------------------------------------------------------------------------------------- */

let activeQueryClient: QueryClient | null = null;

function applySyncedToCaches(
  queryClient: QueryClient,
  item: OutboxItem,
  result: PostedManualTransaction | SubmittedCapture,
): void {
  if (item.kind === "manual") {
    const posted = result as PostedManualTransaction;
    if (posted.transaction) {
      recentTransactionMutations.mark(posted.transaction.id);
      applyTransactionInsertToListCaches(queryClient, {
        userId: posted.transaction.user_id,
        timezone: item.timezone,
        row: posted.transaction,
      });
      invalidateTransactionAggregates(queryClient);
    } else {
      invalidateTransactionDerivedQueries(queryClient);
    }
    return;
  }
  // The new row arrives later through realtime; only the counters and the checklist move now.
  invalidateLimitsQueries(queryClient);
  invalidateOnboardingProgress(queryClient);
}

const appDrain = createOutboxDrain({
  now: Date.now,
  isOnline: () => onlineManager.isOnline(),
  sendManual: (item, { userId, signal }) =>
    submitManualTransaction(item.body!, item.idempotencyKey, {
      timezone: item.timezone,
      timeout: SEND_TIMEOUT_MS,
      signal,
      outboxUserId: userId,
    }),
  sendCapture: (item, { userId, signal }) => {
    const file = item.file!;
    const input = {
      outboxUserId: userId,
      signal,
      fileUri: file.uri,
      fileName: file.name,
      mimeType: file.mimeType,
      idempotencyKey: item.idempotencyKey,
      capturedAt: item.capturedAt,
      timezone: item.timezone,
    };
    const submit = item.kind === "voice" ? submitVoice : submitReceipt;
    return submit(input).catch((error: unknown) => {
      // A device clock running well ahead of the server's: upload with the server's own time instead of failing for good.
      if (error instanceof SubmitError && error.status === 400 && error.code === "captured_at_future" && !signal.aborted) {
        const { capturedAt: _capturedAt, ...withoutCapturedAt } = input;
        return submit(withoutCapturedAt);
      }
      throw error;
    });
  },
  fileExists: outboxFileExists,
  deleteFile: deleteOutboxFile,
  onSynced: (item, result) => {
    if (activeQueryClient) {
      applySyncedToCaches(activeQueryClient, item, result);
    }
  },
});

let timer: ReturnType<typeof setTimeout> | null = null;

function clearTimer(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

/** One timer for the earliest retry that is waiting on a backoff / the daily-limit reset, while the app is in the foreground. */
function scheduleNextAttempt(): void {
  clearTimer();
  // Offline, the connectivity trigger wakes the drain; a timer would only spin on items that are "due".
  if (AppState.currentState !== "active" || !onlineManager.isOnline()) {
    return;
  }
  const at = earliestAttemptAt(useOutboxStore.getState().items);
  if (at === null) {
    return;
  }
  const wait = Math.max(at - Date.now(), MIN_TIMER_MS);
  timer = setTimeout(() => {
    timer = null;
    void requestOutboxDrain();
  }, wait);
}

/** Wakes the drain now (after an enqueue, a reconnect, a foreground, Retry / Sync now). Safe to call anytime. */
export async function requestOutboxDrain(): Promise<void> {
  await appDrain.drain();
  scheduleNextAttempt();
}

/**
 * Starts the app's outbox sync: loads the signed-in user's items, then drains on sign-in, on
 * offline-to-online, on returning to the foreground and on the retry timer. Returns an
 * unsubscribe function.
 */
export function startOutboxSync(queryClient: QueryClient): () => void {
  activeQueryClient = queryClient;

  const loadFor = (userId: string | undefined) => {
    if (userId) {
      useOutboxStore.getState().hydrate(userId);
      void pruneOrphanOutboxFiles(
        useOutboxStore.getState().items.flatMap((item) => (item.file ? [item.file.uri] : [])),
      );
      void requestOutboxDrain();
    } else {
      useOutboxStore.getState().reset();
      clearTimer();
    }
  };
  loadFor(useAuthSessionStore.getState().userId);

  const unsubscribeAuth = useAuthSessionStore.subscribe((state, prev) => {
    if (state.userId !== prev.userId) {
      loadFor(state.userId);
    }
  });
  const unsubscribeConnectivity = useConnectivityStore.subscribe((state, prev) => {
    if (state.isOnline && !prev.isOnline) {
      void requestOutboxDrain();
    }
  });
  const appStateSub = AppState.addEventListener("change", (status) => {
    if (status === "active") {
      void requestOutboxDrain();
    } else {
      clearTimer();
    }
  });
  // NetInfo can report "connected" before the connectivity store hears it (cold start): one look now.
  void NetInfo.fetch()
    .then((state) => {
      if (state.isConnected !== false) {
        void requestOutboxDrain();
      }
    })
    .catch(() => undefined);

  return () => {
    unsubscribeAuth();
    unsubscribeConnectivity();
    appStateSub.remove();
    clearTimer();
    if (activeQueryClient === queryClient) {
      activeQueryClient = null;
    }
  };
}

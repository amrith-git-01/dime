import { useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef } from "react";

import { reportQueryKeys } from "@/features/brokeReport/queryKeys";
import { reminderQueryKeys } from "@/features/reminders/queryKeys";
import { notificationQueryKeys } from "@/features/notifications/queryKeys";
import { findTransactionInCache } from "@/features/notifications/utils/findTransactionInCache";
import {
  isUnhandledNotificationResponseStamp,
  notificationResponseStamp,
} from "@/lib/notifications/notificationResponseStamp";
import {
  readLastHandledNotificationResponseStamp,
  writeLastHandledNotificationResponseStamp,
} from "@/lib/notifications/notificationsMmkv";
import {
  resolvePushAction,
  type NotificationActionData,
} from "@/lib/notifications/resolvePushAction";
import { canNavigateToMain } from "@/navigation/canNavigateToMain";
import { navigationRef } from "@/navigation/navigationRef";

function navigateToNotifications(): void {
  navigationRef.navigate("Main", {
    screen: "Notifications",
  });
}

function handleNotificationAction(
  id: string,
  data: NotificationActionData | undefined,
  queryClient: ReturnType<typeof useQueryClient>,
): boolean {
  const target = resolvePushAction(data);

  if (target.type === "manual_add") {
    navigationRef.navigate("Main", { screen: "ManualAddTransaction" });
    return true;
  }

  if (target.type === "report") {
    navigationRef.navigate("Main", {
      screen: "BrokeReport",
      params: { periodKey: target.periodKey },
    });
    return true;
  }

  if (target.type === "reminder") {
    navigationRef.navigate("Main", {
      screen: "Reminders",
      params: target.reminderId ? { highlightId: target.reminderId } : undefined,
    });
    return true;
  }

  if (target.type === "transaction") {
    const transaction = findTransactionInCache(queryClient, target.transactionId);
    if (transaction) {
      navigationRef.navigate("Main", {
        screen: "TransactionDetail",
        params: { transaction },
      });
      return true;
    }
  }

  navigateToNotifications();
  return true;
}

export function useNotificationOpenHandler(): {
  handleNavigationReady: () => void;
} {
  const queryClient = useQueryClient();
  const handledNotificationIdsRef = useRef<Set<string>>(new Set());
  const pendingResponsesRef = useRef<
    Map<string, Notifications.NotificationResponse>
  >(new Map());

  const maybeHandleOrQueueResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      const id = response.notification.request.identifier;
      const stamp = notificationResponseStamp(id, response.notification.date);

      if (
        !isUnhandledNotificationResponseStamp(
          stamp,
          readLastHandledNotificationResponseStamp(),
        )
      ) {
        handledNotificationIdsRef.current.add(id);
        return;
      }

      if (handledNotificationIdsRef.current.has(id)) {
        return;
      }

      if (pendingResponsesRef.current.has(id)) {
        return;
      }

      const data = response.notification.request.content
        .data as NotificationActionData | null;

      if (canNavigateToMain()) {
        const handled = handleNotificationAction(
          id,
          data ?? undefined,
          queryClient,
        );

        if (handled) {
          handledNotificationIdsRef.current.add(id);
          writeLastHandledNotificationResponseStamp(stamp);
        }

        return;
      }

      pendingResponsesRef.current.set(id, response);
    },
    [queryClient],
  );

  const handleNavigationReady = useCallback(() => {
    if (!canNavigateToMain()) {
      return;
    }

    if (pendingResponsesRef.current.size === 0) {
      return;
    }

    const entries = Array.from(pendingResponsesRef.current.entries());

    entries.forEach(([id, response]) => {
      if (handledNotificationIdsRef.current.has(id)) {
        pendingResponsesRef.current.delete(id);
        return;
      }

      const data = response.notification.request.content
        .data as NotificationActionData | null;

      if (!canNavigateToMain()) {
        return;
      }

      const stamp = notificationResponseStamp(id, response.notification.date);

      if (
        !isUnhandledNotificationResponseStamp(
          stamp,
          readLastHandledNotificationResponseStamp(),
        )
      ) {
        handledNotificationIdsRef.current.add(id);
        pendingResponsesRef.current.delete(id);
        return;
      }

      const handled = handleNotificationAction(
        id,
        data ?? undefined,
        queryClient,
      );

      if (handled) {
        handledNotificationIdsRef.current.add(id);
        writeLastHandledNotificationResponseStamp(stamp);
        pendingResponsesRef.current.delete(id);
      }
    });
  }, [queryClient]);

  useEffect(() => {
    function handleResponse(
      response: Notifications.NotificationResponse,
    ): void {
      maybeHandleOrQueueResponse(response);
    }

    const subscription =
      Notifications.addNotificationResponseReceivedListener(handleResponse);

    return () => {
      subscription.remove();
    };
  }, [maybeHandleOrQueueResponse]);

  // A push that arrives while the app is open: the inbox and badge are now behind the server.
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({
        queryKey: notificationQueryKeys.all,
      });
      // A report-ready push means a new report: the list (and a period asked for before it existed) is
      // behind the server too. Snapshots already cached never change, so refetching them is cheap.
      void queryClient.invalidateQueries({ queryKey: reportQueryKeys.all });
      // A reminder push: the list (and Home's Upcoming card) may have moved on.
      void queryClient.invalidateQueries({ queryKey: reminderQueryKeys.all });
    });
    return () => subscription.remove();
  }, [queryClient]);

  useEffect(() => {
    const unsubscribe = navigationRef.addListener("state", () => {
      if (!canNavigateToMain()) {
        return;
      }

      handleNavigationReady();
    });

    return unsubscribe;
  }, [handleNavigationReady]);

  return {
    handleNavigationReady,
  };
}

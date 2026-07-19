import { useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef } from "react";

import { findTransactionInCache } from "@/features/notifications/utils/findTransactionInCache";
import { navigationRef } from "@/navigation/navigationRef";

type NotificationActionData = {
  action_type?: string;
  action_transaction_id?: string;
  // Allow additional backend fields without tightening the type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

function canNavigateToMain(): boolean {
  if (!navigationRef.isReady()) {
    return false;
  }

  const rootState = navigationRef.getRootState();

  if (!rootState) {
    return false;
  }

  return rootState.routeNames?.includes("Main") ?? false;
}

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
  const transactionId =
    typeof data?.action_transaction_id === "string"
      ? data.action_transaction_id
      : null;

  if (transactionId) {
    const transaction = findTransactionInCache(queryClient, transactionId);
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

      const handled = handleNotificationAction(
        id,
        data ?? undefined,
        queryClient,
      );

      if (handled) {
        handledNotificationIdsRef.current.add(id);
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

    void Notifications.getLastNotificationResponseAsync().then(
      (lastResponse) => {
        if (lastResponse) {
          handleResponse(lastResponse);
        }
      },
    );

    return () => {
      subscription.remove();
    };
  }, [maybeHandleOrQueueResponse]);

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


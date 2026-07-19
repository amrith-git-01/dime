import { useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";

import { findTransactionInCache } from "@/features/notifications/utils/findTransactionInCache";
import { navigationRef } from "@/navigation/navigationRef";

type NotificationActionData = {
  action_type?: string;
  action_transaction_id?: string;
  // Allow additional backend fields without tightening the type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

function navigateToNotifications(): void {
  if (!navigationRef.isReady()) {
    return;
  }

  navigationRef.navigate("Main", {
    screen: "Notifications",
  });
}

function handleNotificationAction(
  data: NotificationActionData | undefined,
  queryClient: ReturnType<typeof useQueryClient>,
): void {
  if (!navigationRef.isReady()) {
    return;
  }

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
      return;
    }
  }

  navigateToNotifications();
}

export function useNotificationOpenHandler(): void {
  const queryClient = useQueryClient();
  const lastHandledNotificationIdRef = useRef<string | null>(null);

  useEffect(() => {
    function handleResponse(
      response: Notifications.NotificationResponse,
    ): void {
      const id = response.notification.request.identifier;
      if (lastHandledNotificationIdRef.current === id) {
        return;
      }
      lastHandledNotificationIdRef.current = id;

      const data = response.notification.request.content
        .data as NotificationActionData | null;

      handleNotificationAction(data ?? undefined, queryClient);
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
  }, [queryClient]);
}


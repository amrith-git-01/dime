import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";

import { useNotificationsFeed } from "@/features/notifications/hooks/useNotificationsFeed";
import type { AppNotification } from "@/features/notifications/types";
import { findTransactionInCache } from "@/features/notifications/utils/findTransactionInCache";
import { useToast } from "@/features/toast/useToast";
import type { MainStackParamList } from "@/navigation/types";

export function useNotificationsScreenModel() {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const {
    filter,
    setFilter,
    listItems,
    isInboxEmpty,
    isFilterEmpty,
    markRead,
    deleteNotification,
    isUnread,
    isInitialLoading,
    isError,
    loadMore,
    isFetchingNextPage,
  } = useNotificationsFeed();

  const handlePress = useCallback(
    (notification: AppNotification) => {
      markRead(notification.id);

      switch (notification.action.type) {
        case "home":
          navigation.goBack();
          break;
        case "manual_add":
          navigation.navigate("ManualAddTransaction");
          break;
        case "transaction_detail": {
          const transaction = findTransactionInCache(
            queryClient,
            notification.action.transactionId,
          );
          if (transaction) {
            navigation.navigate("TransactionDetail", { transaction });
          } else {
            showToast({
              variant: "info",
              message: "Open Transactions to view this entry",
            });
            navigation.navigate("MainTabs", { screen: "Transactions" });
          }
          break;
        }
        case "none":
          break;
        default:
          break;
      }
    },
    [markRead, navigation, queryClient, showToast],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteNotification(id);
    },
    [deleteNotification],
  );

  const openSwipeRef = useRef<SwipeableMethods | null>(null);
  const handleSwipeWillStart = useCallback((methods: SwipeableMethods) => {
    if (openSwipeRef.current != null && openSwipeRef.current !== methods) {
      openSwipeRef.current.close();
    }
    openSwipeRef.current = methods;
  }, []);

  return {
    filter,
    setFilter,
    listItems,
    isInboxEmpty,
    isFilterEmpty,
    isUnread,
    isInitialLoading,
    isError,
    isFetchingNextPage,
    loadMore,
    markRead,
    handlePress,
    handleDelete,
    handleSwipeWillStart,
  };
}

import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";

import { NotificationBentoRow } from "@/components/notifications/NotificationBentoRow";
import { NotificationsFilterTabs } from "@/components/notifications/NotificationsFilterTabs";
import { EmptyState, emptyStateCopy } from "@/components/shared";
import {
  inkSoft,
  radius,
  shadows,
  spacing,
  surface,
} from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { NotificationsInboxSkeleton } from "@/features/notifications/components/NotificationsInboxSkeleton";
import { useNotificationsFeed } from "@/features/notifications/hooks/useNotificationsFeed";
import type { AppNotification } from "@/features/notifications/types";
import { findTransactionInCache } from "@/features/notifications/utils/findTransactionInCache";
import { useToast } from "@/features/toast/useToast";
import type { MainStackParamList } from "@/navigation/types";

import {
  NOTIFICATION_FILTER_EMPTY,
  NOTIFICATION_INBOX_EMPTY,
} from "./notificationEmptyCopy";

export default function NotificationsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const {
    filter,
    setFilter,
    groups,
    isInboxEmpty,
    isFilterEmpty,
    markRead,
    deleteNotification,
    isUnread,
    isInitialLoading,
    isError,
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

  const handleMarkRead = useCallback(
    (id: string) => {
      markRead(id);
    },
    [markRead],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteNotification(id);
    },
    [deleteNotification],
  );

  if (isInitialLoading) {
    return <NotificationsInboxSkeleton />;
  }

  if (isError) {
    return (
      <EmptyState
        layout="centered"
        headline={emptyStateCopy.notificationsError.headline}
        subtext={emptyStateCopy.notificationsError.subtext}
      />
    );
  }

  if (isInboxEmpty) {
    return (
      <EmptyState
        layout="centered"
        headline={NOTIFICATION_INBOX_EMPTY.title}
        subtext={NOTIFICATION_INBOX_EMPTY.message}
      />
    );
  }

  return (
    <View style={styles.root}>
      <NotificationsFilterTabs value={filter} onChange={setFilter} />

      {isFilterEmpty ? (
        <View style={styles.filterEmptyWrap}>
          <EmptyState
            layout="centered"
            headline={NOTIFICATION_FILTER_EMPTY[filter].title}
            subtext={NOTIFICATION_FILTER_EMPTY[filter].message}
          />
        </View>
      ) : (
        <View style={styles.sections}>
          {groups.map((group) => (
            <View key={group.key} style={styles.groupWrap}>
              <Text style={styles.groupHeader}>{group.title}</Text>
              <View style={styles.groupCard}>
                {group.items.map((item, index) => (
                  <NotificationBentoRow
                    key={item.id}
                    notification={item}
                    unread={isUnread(item)}
                    onPress={handlePress}
                    onMarkRead={handleMarkRead}
                    onDelete={handleDelete}
                    showSeparator={index < group.items.length - 1}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
    gap: spacing.md,
  },
  sections: {
    gap: spacing.md,
  },
  filterEmptyWrap: {
    flexGrow: 1,
    justifyContent: "center",
  },
  groupWrap: {
    gap: spacing.sm,
  },
  groupHeader: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: inkSoft,
  },
  groupCard: {
    backgroundColor: surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    ...shadows.card,
  },
});

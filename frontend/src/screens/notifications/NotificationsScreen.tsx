import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react-native";
import { useCallback } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { NotificationBentoRow } from "@/components/notifications/NotificationBentoRow";
import { NotificationsFilterTabs } from "@/components/notifications/NotificationsFilterTabs";
import { TwoToneEmptyState } from "@/components/shared";
import { colors, spacing } from "@/constants";
import { useNotificationsFeed } from "@/features/notifications/hooks/useNotificationsFeed";
import type { AppNotification } from "@/features/notifications/types";
import { findTransactionInCache } from "@/features/notifications/utils/findTransactionInCache";
import { SettingsSection } from "@/features/settings/components";
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
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }

  if (isError) {
    return (
      <TwoToneEmptyState
        layout="centered"
        icon={Bell}
        title="Could not load notifications"
        message="Check your connection and pull to refresh from the tab bar."
      />
    );
  }

  if (isInboxEmpty) {
    return (
      <TwoToneEmptyState
        layout="centered"
        icon={Bell}
        {...NOTIFICATION_INBOX_EMPTY}
      />
    );
  }

  return (
    <View style={styles.root}>
      <NotificationsFilterTabs value={filter} onChange={setFilter} />

      {isFilterEmpty ? (
        <View style={styles.filterEmptyWrap}>
          <TwoToneEmptyState
            layout="centered"
            icon={Bell}
            {...NOTIFICATION_FILTER_EMPTY[filter]}
          />
        </View>
      ) : (
        <View style={styles.sections}>
          {groups.map((group) => (
            <SettingsSection key={group.key} title={group.title} compact>
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
            </SettingsSection>
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
  centered: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

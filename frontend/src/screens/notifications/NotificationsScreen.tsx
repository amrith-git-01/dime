import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NotificationBentoRow } from "@/components/notifications/NotificationBentoRow";
import { NotificationsFilterTabs } from "@/components/notifications/NotificationsFilterTabs";
import { EmptyState, emptyStateCopy } from "@/components/shared";
import { colors, spacing, typography } from "@/constants";
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

  const handleDelete = useCallback(
    (id: string) => {
      deleteNotification(id);
    },
    [deleteNotification],
  );

  const insets = useSafeAreaInsets();
  const openSwipeRef = useRef<SwipeableMethods | null>(null);
  const handleSwipeWillStart = useCallback((methods: SwipeableMethods) => {
    if (openSwipeRef.current != null && openSwipeRef.current !== methods) {
      openSwipeRef.current.close();
    }
    openSwipeRef.current = methods;
  }, []);

  if (isInitialLoading) {
    return (
      <View style={styles.paddedFill}>
        <NotificationsInboxSkeleton />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.paddedFill}>
        <EmptyState
          layout="centered"
          headline={emptyStateCopy.notificationsError.headline}
          subtext={emptyStateCopy.notificationsError.subtext}
        />
      </View>
    );
  }

  if (isInboxEmpty) {
    return (
      <View style={styles.paddedFill}>
        <EmptyState
          layout="centered"
          headline={NOTIFICATION_INBOX_EMPTY.title}
          subtext={NOTIFICATION_INBOX_EMPTY.message}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.root,
        { paddingBottom: spacing.xl + insets.bottom },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      overScrollMode="never"
      bounces={false}
    >
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
              {group.items.map((item) => (
                <NotificationBentoRow
                  key={item.id}
                  notification={item}
                  unread={isUnread(item)}
                  onPress={handlePress}
                  onMarkRead={markRead}
                  onDelete={handleDelete}
                  onSwipeWillStart={handleSwipeWillStart}
                />
              ))}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.pageBackground,
  },
  paddedFill: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    backgroundColor: colors.pageBackground,
  },
  root: {
    flexGrow: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  sections: {
    gap: spacing.lg,
  },
  filterEmptyWrap: {
    flexGrow: 1,
    justifyContent: "center",
  },
  groupWrap: {
    gap: spacing.md,
  },
  groupHeader: {
    ...typography.eyebrow,
  },
});

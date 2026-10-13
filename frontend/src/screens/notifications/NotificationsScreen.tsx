import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { ActivityIndicator, Text, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState, emptyStateCopy } from "@/components/shared";
import { spacing } from "@/constants";
import {
  NotificationBentoRow,
  NotificationsFilterTabs,
  NotificationsInboxSkeleton,
} from "@/features/notifications/components";
import type { NotificationListItem } from "@/features/notifications/utils/flattenNotificationGroups";

import {
  NOTIFICATION_FILTER_EMPTY,
  NOTIFICATION_INBOX_EMPTY,
} from "./notificationEmptyCopy";
import { useNotificationsScreenModel } from "./useNotificationsScreenModel";
import { createThemedStyles, useTheme } from "@/theme";

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const {
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
  } = useNotificationsScreenModel();

  const insets = useSafeAreaInsets();

  const renderItem: ListRenderItem<NotificationListItem> = ({ item }) => {
    if (item.kind === "header") {
      return (
        <Text style={[styles.groupHeader, !item.isFirst && styles.groupGap]}>
          {item.title}
        </Text>
      );
    }
    return (
      <View style={styles.rowWrap}>
        <NotificationBentoRow
          notification={item.notification}
          unread={isUnread(item.notification)}
          onPress={handlePress}
          onMarkRead={markRead}
          onDelete={handleDelete}
          onSwipeWillStart={handleSwipeWillStart}
        />
      </View>
    );
  };

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
    <FlashList
      style={styles.scroll}
      data={isFilterEmpty ? NO_ITEMS : listItems}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      renderScrollComponent={ScrollView}
      contentContainerStyle={{
        backgroundColor: colors.paper,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        paddingBottom: spacing.xl + insets.bottom,
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      overScrollMode="never"
      bounces={false}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        <View style={styles.tabsWrap}>
          <NotificationsFilterTabs value={filter} onChange={setFilter} />
        </View>
      }
      ListEmptyComponent={
        isFilterEmpty ? (
          <View style={styles.filterEmptyWrap}>
            <EmptyState
              layout="centered"
              headline={NOTIFICATION_FILTER_EMPTY[filter].title}
              subtext={NOTIFICATION_FILTER_EMPTY[filter].message}
            />
          </View>
        ) : null
      }
      ListFooterComponent={
        isFetchingNextPage ? (
          <View style={styles.loadingMore}>
            <ActivityIndicator color={colors.accentText} />
          </View>
        ) : null
      }
    />
  );
}

const NO_ITEMS: NotificationListItem[] = [];

function keyExtractor(item: NotificationListItem): string {
  return item.id;
}

function getItemType(item: NotificationListItem): NotificationListItem["kind"] {
  return item.kind;
}

const useStyles = createThemedStyles(({ colors, typography }) => ({
  scroll: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  paddedFill: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    backgroundColor: colors.paper,
  },
  tabsWrap: {
    paddingBottom: spacing.md,
  },
  filterEmptyWrap: {
    minHeight: 320,
    justifyContent: "center",
  },
  groupHeader: {
    ...typography.eyebrow,
    paddingBottom: spacing.md,
  },
  groupGap: {
    paddingTop: spacing.lg,
  },
  rowWrap: {
    paddingBottom: spacing.md,
  },
  loadingMore: {
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
}));

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useSessionUserId } from "@/hooks/useSessionUserId";
import {
  readPersistedNotifications,
  writePersistedNotifications,
} from "@/lib/notifications/notificationsMmkv";
import { NOTIFICATIONS_QUERY_STALE_MS } from "@/lib/queryDefaults";
import {
  deleteNotification,
  fetchNotificationsPage,
  markNotificationRead,
} from "../api/notificationsApi";
import {
  adjustUnreadCountCache,
  patchInboxNotification,
  removeInboxNotification,
  restoreInboxNotification,
} from "../cache/notificationListCache";
import { notificationQueryKeys } from "../queryKeys";
import type { AppNotification, NotificationInboxFilter } from "../types";
import { filterNotificationsByInbox } from "../utils/filterNotificationsByInbox";
import { flattenNotificationGroups } from "../utils/flattenNotificationGroups";
import { groupNotificationsByDate } from "../utils/groupNotificationsByDate";
import {
  buildInboxData,
  findNotificationInPages,
  flattenNotificationPages,
  NOTIFICATIONS_PAGE_LIMIT,
  resolveSeedCursor,
  type NotificationsInboxData,
} from "../utils/notificationPages";

/** Filter tabs slice the loaded pages client-side; keep paging until a tab has this many rows. */
const MIN_FILTERED_ITEMS = 20;

export function useNotificationsFeed() {
  const queryClient = useQueryClient();
  const { userId } = useSessionUserId();
  const [filter, setFilter] = useState<NotificationInboxFilter>("all");

  const listQuery = useInfiniteQuery({
    queryKey: notificationQueryKeys.inboxList(userId),
    enabled: Boolean(userId),
    staleTime: NOTIFICATIONS_QUERY_STALE_MS,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const before = pageParam as string | undefined;
      const page = await fetchNotificationsPage({ before });
      if (before === undefined && userId) {
        // Only the first page is persisted: it seeds the next cold start.
        const unreadCount =
          queryClient.getQueryData<number>(
            notificationQueryKeys.unreadCount(userId),
          ) ??
          readPersistedNotifications(userId)?.unreadCount ??
          page.items.filter((item) => item.readAt == null).length;
        writePersistedNotifications(userId, {
          inbox: page.items,
          unreadCount,
          nextCursor: page.nextCursor,
        });
      }
      return page;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: (): NotificationsInboxData | undefined => {
      const snapshot = readPersistedNotifications(userId);
      if (!snapshot) {
        return undefined;
      }
      return buildInboxData(
        snapshot.inbox,
        resolveSeedCursor(
          snapshot.inbox,
          snapshot.nextCursor,
          NOTIFICATIONS_PAGE_LIMIT,
        ),
      );
    },
  });

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = listQuery;

  const items = useMemo(() => {
    const all = flattenNotificationPages(listQuery.data);
    return filterNotificationsByInbox(all, filter);
  }, [listQuery.data, filter]);
  const groups = useMemo(() => groupNotificationsByDate(items), [items]);
  const listItems = useMemo(() => flattenNotificationGroups(groups), [groups]);
  const settled = !listQuery.isPending && !listQuery.isError;
  const isInitialLoading = listQuery.isPending && listQuery.data === undefined;

  const isInboxEmpty =
    settled && filter === "all" && items.length === 0 && !hasNextPage;
  const isFilterEmpty =
    settled && filter !== "all" && items.length === 0 && !hasNextPage;

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // A narrow filter can leave too few rows to scroll (so `onEndReached` never fires) while
  // older pages still hold matches; top the tab up.
  const needsMoreForFilter =
    settled &&
    filter !== "all" &&
    items.length < MIN_FILTERED_ITEMS &&
    Boolean(hasNextPage) &&
    !isFetchingNextPage;
  useEffect(() => {
    if (needsMoreForFilter) {
      void fetchNextPage();
    }
  }, [needsMoreForFilter, fetchNextPage]);

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onMutate: async (id) => {
      const prev = findNotificationInPages(
        queryClient.getQueryData<NotificationsInboxData>(
          notificationQueryKeys.inboxList(userId),
        ),
        id,
      );
      if (prev?.readAt != null) return { prev: undefined };
      const readAt = new Date().toISOString();
      patchInboxNotification(queryClient, userId, id, { readAt });
      adjustUnreadCountCache(queryClient, userId, -1);
      return { prev };
    },
    onError: (_err, id, context) => {
      if (!context?.prev) return;
      patchInboxNotification(queryClient, userId, id, {
        readAt: context.prev.readAt,
      });
      adjustUnreadCountCache(queryClient, userId, 1);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: notificationQueryKeys.unreadCount(userId),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteNotification,
    onMutate: async (id) => {
      const prev = findNotificationInPages(
        queryClient.getQueryData<NotificationsInboxData>(
          notificationQueryKeys.inboxList(userId),
        ),
        id,
      );
      removeInboxNotification(queryClient, userId, id);
      if (prev?.readAt == null) {
        adjustUnreadCountCache(queryClient, userId, -1);
      }
      return { prev };
    },
    onError: (_err, id, context) => {
      const prev = context?.prev;
      if (!prev) return;
      restoreInboxNotification(queryClient, userId, prev);
      if (prev.readAt == null) {
        adjustUnreadCountCache(queryClient, userId, 1);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: notificationQueryKeys.unreadCount(userId),
      });
    },
  });

  const markRead = useCallback(
    (id: string) => {
      markReadMutation.mutate(id);
    },
    [markReadMutation],
  );

  const removeNotification = useCallback(
    (id: string) => {
      deleteMutation.mutate(id);
    },
    [deleteMutation],
  );

  const isUnread = useCallback(
    (notification: AppNotification) => notification.readAt == null,
    [],
  );

  return {
    filter,
    setFilter,
    groups,
    listItems,
    isInboxEmpty,
    isFilterEmpty,
    markRead,
    deleteNotification: removeNotification,
    isUnread,
    isInitialLoading,
    isError: listQuery.isError,
    loadMore,
    isFetchingNextPage,
    refetch: listQuery.refetch,
  };
}

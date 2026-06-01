import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import {
  deleteNotification,
  fetchNotifications,
  markNotificationRead,
} from "../api/notificationsApi";
import {
  adjustUnreadCountCache,
  patchInboxNotification,
  removeInboxNotification,
} from "../cache/notificationListCache";
import { notificationQueryKeys } from "../queryKeys";
import type { AppNotification, NotificationInboxFilter } from "../types";
import { filterNotificationsByInbox } from "../utils/filterNotificationsByInbox";
import { groupNotificationsByDate } from "../utils/groupNotificationsByDate";

const INBOX_STALE_MS = 60_000;

export function useNotificationsFeed() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<NotificationInboxFilter>("all");

  const listQuery = useQuery({
    queryKey: notificationQueryKeys.inboxList(),
    queryFn: () => fetchNotifications("all"),
    staleTime: INBOX_STALE_MS,
  });

  const items = useMemo(() => {
    const all = listQuery.data ?? [];
    return filterNotificationsByInbox(all, filter);
  }, [listQuery.data, filter]);
  const groups = useMemo(() => groupNotificationsByDate(items), [items]);
  const settled = !listQuery.isPending && !listQuery.isError;
  const isInitialLoading = listQuery.isPending && listQuery.data === undefined;

  const isInboxEmpty = settled && filter === "all" && items.length === 0;
  const isFilterEmpty = settled && filter !== "all" && items.length === 0;

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onMutate: async (id) => {
      const list =
        queryClient.getQueryData<AppNotification[]>(
          notificationQueryKeys.inboxList(),
        ) ?? [];
      const prev = list.find((item) => item.id === id);
      if (prev?.readAt != null) return { prev: undefined };
      const readAt = new Date().toISOString();
      patchInboxNotification(queryClient, id, { readAt });
      adjustUnreadCountCache(queryClient, -1);
      return { prev };
    },
    onError: (_err, id, context) => {
      if (!context?.prev) return;
      patchInboxNotification(queryClient, id, {
        readAt: context.prev.readAt,
      });
      adjustUnreadCountCache(queryClient, 1);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: notificationQueryKeys.unreadCount(),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteNotification,
    onMutate: async (id) => {
      const list =
        queryClient.getQueryData<AppNotification[]>(
          notificationQueryKeys.inboxList(),
        ) ?? [];
      const prev = list.find((item) => item.id === id);
      removeInboxNotification(queryClient, id);
      if (prev?.readAt == null) {
        adjustUnreadCountCache(queryClient, -1);
      }
      return { prev };
    },
    onError: (_err, id, context) => {
      const prev = context?.prev;
      if (!prev) return;
      queryClient.setQueryData<AppNotification[]>(
        notificationQueryKeys.inboxList(),
        (current) => {
          const next = current ?? [];
          if (next.some((item) => item.id === id)) return next;
          return [prev, ...next];
        },
      );
      if (prev.readAt == null) {
        adjustUnreadCountCache(queryClient, 1);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: notificationQueryKeys.unreadCount(),
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
    isInboxEmpty,
    isFilterEmpty,
    markRead,
    deleteNotification: removeNotification,
    isUnread,
    isInitialLoading,
    isError: listQuery.isError,
    refetch: listQuery.refetch,
  };
}

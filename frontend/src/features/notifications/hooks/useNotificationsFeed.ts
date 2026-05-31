import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import {
  deleteNotification,
  fetchNotifications,
  markNotificationRead,
} from "../api/notificationsApi";
import { notificationQueryKeys } from "../queryKeys";
import type { AppNotification, NotificationInboxFilter } from "../types";
import { groupNotificationsByDate } from "../utils/groupNotificationsByDate";

export function useNotificationsFeed() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<NotificationInboxFilter>("all");

  const listQuery = useQuery({
    queryKey: notificationQueryKeys.list(filter),
    queryFn: () => fetchNotifications(filter),
  });

  const items = listQuery.data ?? [];
  const groups = useMemo(() => groupNotificationsByDate(items), [items]);
  const settled = !listQuery.isPending && !listQuery.isError;

  const isInboxEmpty = settled && filter === "all" && items.length === 0;
  const isFilterEmpty = settled && filter !== "all" && items.length === 0;

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: notificationQueryKeys.all,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteNotification,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: notificationQueryKeys.all,
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
    isLoading: listQuery.isPending,
    isError: listQuery.isError,
    refetch: listQuery.refetch,
  };
}

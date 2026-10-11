export const notificationQueryKeys = {
  all: ["notifications"] as const,
  /** Full inbox — filter tabs slice this client-side. */
  inboxList: (userId: string | undefined) =>
    [...notificationQueryKeys.all, "inboxList", userId ?? "none"] as const,
  unreadCount: (userId: string | undefined) =>
    [...notificationQueryKeys.all, "unreadCount", userId ?? "none"] as const,
  /** Prefix of every user's unread-count key, for invalidation without a user id. */
  unreadCountAll: () => [...notificationQueryKeys.all, "unreadCount"] as const,
};

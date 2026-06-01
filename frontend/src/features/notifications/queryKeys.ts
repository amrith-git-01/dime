export const notificationQueryKeys = {
  all: ["notifications"] as const,
  /** Full inbox — filter tabs slice this client-side. */
  inboxList: () => [...notificationQueryKeys.all, "inboxList"] as const,
  unreadCount: () => [...notificationQueryKeys.all, "unreadCount"] as const,
};

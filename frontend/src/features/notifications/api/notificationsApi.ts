import { dimeApi } from "@/lib/api/dimeApi";

import type { AppNotification, NotificationInboxFilter } from "../types";
import { normalizeNotificationKind } from "../utils/normalizeNotification";
import {
  NOTIFICATIONS_PAGE_LIMIT,
  type NotificationsPage,
} from "../utils/notificationPages";

/**
 * `kind` and `action.type` are plain strings on purpose: a newer server can send values this build
 * does not know, and the mapping below must absorb them instead of trusting the type.
 */
export type NotificationDto = {
  id: string;
  kind: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
  action?: {
    type: string;
    transaction_id?: string | null;
    /** `YYYY-MM`, only on the `report` action. */
    period_key?: string | null;
  } | null;
};

function mapAction(
  action: NotificationDto["action"],
): AppNotification["action"] {
  switch (action?.type) {
    case "transaction_detail":
      if (action.transaction_id) {
        return {
          type: "transaction_detail",
          transactionId: action.transaction_id,
        };
      }
      return { type: "none" };
    case "report":
      if (action.period_key) {
        return { type: "report", periodKey: action.period_key };
      }
      return { type: "none" };
    case "home":
      return { type: "home" };
    case "manual_add":
      return { type: "manual_add" };
    case "none":
      return { type: "none" };
    default:
      return { type: "none" };
  }
}

export function mapNotificationDto(dto: NotificationDto): AppNotification {
  return {
    id: dto.id,
    kind: normalizeNotificationKind(dto.kind),
    title: dto.title,
    body: dto.body,
    createdAt: dto.created_at,
    readAt: dto.read_at,
    action: mapAction(dto.action),
  };
}

export async function fetchNotificationsPage(input: {
  filter?: NotificationInboxFilter;
  /** ISO timestamp cursor — the `next_cursor` of the previous page. */
  before?: string;
}): Promise<NotificationsPage> {
  const { data } = await dimeApi.get<{
    items: NotificationDto[];
    next_cursor?: string | null;
  }>("/api/v1/notifications", {
    params: {
      filter: input.filter ?? "all",
      limit: NOTIFICATIONS_PAGE_LIMIT,
      before: input.before,
    },
  });
  return {
    items: data.items.map(mapNotificationDto),
    nextCursor: data.next_cursor ?? null,
  };
}

export async function markNotificationRead(
  id: string,
): Promise<AppNotification> {
  const { data } = await dimeApi.patch<NotificationDto>(
    `/api/v1/notifications/${id}/read`,
  );
  return mapNotificationDto(data);
}

export async function deleteNotification(id: string): Promise<void> {
  await dimeApi.delete(`/api/v1/notifications/${id}`);
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const { data } = await dimeApi.get<{ count: number }>(
    "/api/v1/notifications/unread-count",
  );
  return data.count;
}

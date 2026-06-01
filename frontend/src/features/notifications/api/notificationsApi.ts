import { dimeApi } from "@/lib/api/dimeApi";

import type { AppNotification, NotificationInboxFilter } from "../types";

export type NotificationDto = {
  id: string;
  kind: "transaction_auto" | "budget_threshold" | "capture_failed";
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
  action: {
    type: "transaction_detail" | "home" | "manual_add" | "none";
    transaction_id: string | null;
  };
};

function mapAction(
  action: NotificationDto["action"],
): AppNotification["action"] {
  switch (action.type) {
    case "transaction_detail":
      if (action.transaction_id) {
        return {
          type: "transaction_detail",
          transactionId: action.transaction_id,
        };
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
    kind: dto.kind,
    title: dto.title,
    body: dto.body,
    createdAt: dto.created_at,
    readAt: dto.read_at,
    action: mapAction(dto.action),
  };
}

export async function fetchNotifications(
  filter: NotificationInboxFilter,
): Promise<AppNotification[]> {
  const { data } = await dimeApi.get<{ items: NotificationDto[] }>(
    "/api/v1/notifications",
    { params: { filter } },
  );
  return data.items.map(mapNotificationDto);
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

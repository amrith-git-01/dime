import type { AppNotification, NotificationAction } from "@/features/notifications/types";
import { renderHookWithClient } from "@/test-utils/renderHookWithClient";
import { createTestQueryClient } from "@/test-utils/testQueryClient";

import { useNotificationsScreenModel } from "../useNotificationsScreenModel";

const mockNav = { navigate: jest.fn(), goBack: jest.fn() };
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => mockNav,
}));

const mockMarkRead = jest.fn();
jest.mock("@/features/notifications/hooks/useNotificationsFeed", () => ({
  useNotificationsFeed: () => ({
    filter: "all",
    setFilter: jest.fn(),
    listItems: [],
    isInboxEmpty: true,
    isFilterEmpty: false,
    markRead: mockMarkRead,
    deleteNotification: jest.fn(),
    isUnread: () => false,
    isInitialLoading: false,
    isError: false,
    loadMore: jest.fn(),
    isFetchingNextPage: false,
  }),
}));
jest.mock("@/features/notifications/utils/findTransactionInCache", () => ({
  findTransactionInCache: jest.fn(() => null),
}));

function notification(action: NotificationAction): AppNotification {
  return {
    id: "n1",
    kind: "reminder_due",
    title: "Rent due in 2 days",
    body: "To Landlord",
    createdAt: "2026-11-01T00:00:00Z",
    readAt: null,
    action,
  };
}

function press(action: NotificationAction) {
  const hook = renderHookWithClient(createTestQueryClient(), () => useNotificationsScreenModel());
  hook.current.handlePress(notification(action));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useNotificationsScreenModel.handlePress (reminders)", () => {
  it("opens the Reminders list on the reminder the notification is about", () => {
    press({ type: "reminder", reminderId: "r1" });
    expect(mockMarkRead).toHaveBeenCalledWith("n1");
    expect(mockNav.navigate).toHaveBeenCalledWith("Reminders", { highlightId: "r1" });
  });

  it("opens the plain list for a recurring item's lead reminder (no id)", () => {
    press({ type: "reminder", reminderId: null });
    expect(mockNav.navigate).toHaveBeenCalledWith("Reminders", undefined);
  });

  it("does nothing but mark it read for an action it does not know", () => {
    press({ type: "none" });
    press({ type: "teleport" } as unknown as NotificationAction);
    expect(mockMarkRead).toHaveBeenCalledTimes(2);
    expect(mockNav.navigate).not.toHaveBeenCalled();
  });
});

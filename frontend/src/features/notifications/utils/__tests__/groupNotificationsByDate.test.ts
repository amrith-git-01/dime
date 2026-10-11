import type { AppNotification } from "../../types";
import { groupNotificationsByDate } from "../groupNotificationsByDate";

function note(id: string, createdAt: string): AppNotification {
  return {
    id,
    kind: "transaction_auto",
    title: id,
    body: "body",
    createdAt,
    readAt: null,
    action: { type: "none" },
  };
}

describe("groupNotificationsByDate", () => {
  const now = new Date("2026-08-15T12:00:00");

  const groups = groupNotificationsByDate(
    [
      note("jun", "2026-06-22T09:41:00"),
      note("today", "2026-08-15T08:12:00"),
      note("jun2", "2026-06-22T18:00:00"),
      note("yday", "2026-08-14T19:05:00"),
      note("old-year", "2025-12-01T10:00:00"),
    ],
    now,
  );

  it("creates today, yesterday, 22 Jun and 1 Dec 2025 groups", () => {
    expect(groups).toHaveLength(4);
  });

  it("puts today first and yesterday second", () => {
    expect(groups[0]).toMatchObject({ key: "today", title: "Today" });
    expect(groups[1]).toMatchObject({ key: "yesterday", title: "Yesterday" });
  });

  it("uses the calendar day for older dates, newest first", () => {
    expect(groups[2]?.title).toBe("22 Jun");
    expect(groups[2]?.items.map((item) => item.id)).toEqual(["jun2", "jun"]);
  });

  it("includes the year for other years", () => {
    expect(groups[3]?.title).toBe("1 Dec 2025");
  });
});

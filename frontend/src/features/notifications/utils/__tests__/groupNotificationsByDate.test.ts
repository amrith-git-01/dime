import type { AppNotification } from "../../types";
import { groupNotificationsByDate } from "../groupNotificationsByDate";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

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

function run(): void {
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

  assert(groups.length === 4, "today, yesterday, 22 Jun, 1 Dec 2025");
  assert(
    groups[0]?.key === "today" && groups[0].title === "Today",
    "today first",
  );
  assert(
    groups[1]?.key === "yesterday" && groups[1].title === "Yesterday",
    "yesterday second",
  );
  assert(
    groups[2]?.title === "22 Jun",
    "June 22 uses calendar day, not Earlier",
  );
  assert(
    groups[2]?.items.map((item) => item.id).join(",") === "jun2,jun",
    "same day newest first",
  );
  assert(groups[3]?.title === "1 Dec 2025", "other year includes year");

  console.log("groupNotificationsByDate tests passed");
}

run();

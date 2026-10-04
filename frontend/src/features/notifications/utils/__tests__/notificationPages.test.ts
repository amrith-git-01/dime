import type { AppNotification } from "../../types";
import { flattenNotificationGroups } from "../flattenNotificationGroups";
import {
  buildInboxData,
  findNotificationInPages,
  flattenNotificationPages,
  patchNotificationInPages,
  removeNotificationFromPages,
  resolveSeedCursor,
  restoreNotificationInPages,
} from "../notificationPages";

function note(id: string, createdAt = "2026-08-15T08:00:00"): AppNotification {
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

function twoPages() {
  return {
    pages: [
      { items: [note("a"), note("b")], nextCursor: "cursor-1" },
      { items: [note("c"), note("d")], nextCursor: null },
    ],
    pageParams: [undefined, "cursor-1"],
  };
}

describe("notification pages", () => {
  it("flattens pages in order and drops repeated ids", () => {
    const data = twoPages();
    data.pages[1].items.unshift(note("b"));
    expect(flattenNotificationPages(data).map((n) => n.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(flattenNotificationPages(undefined)).toEqual([]);
  });

  it("patches a notification on any page without touching others", () => {
    const next = patchNotificationInPages(twoPages(), "c", {
      readAt: "2026-08-15T09:00:00",
    });
    expect(findNotificationInPages(next, "c")?.readAt).toBe(
      "2026-08-15T09:00:00",
    );
    expect(findNotificationInPages(next, "a")?.readAt).toBeNull();
    expect(next.pages[1].nextCursor).toBeNull();
  });

  it("removes a notification from whichever page holds it", () => {
    const next = removeNotificationFromPages(twoPages(), "d");
    expect(flattenNotificationPages(next).map((n) => n.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("restores a removed notification at the head of the first page once", () => {
    const removed = removeNotificationFromPages(twoPages(), "c");
    const restored = restoreNotificationInPages(removed, note("c"));
    expect(restored.pages[0].items.map((n) => n.id)).toEqual(["c", "a", "b"]);
    expect(restoreNotificationInPages(restored, note("c"))).toBe(restored);
  });

  it("wraps a first page as infinite-query data", () => {
    const data = buildInboxData([note("a")], "next");
    expect(data.pages).toEqual([{ items: [note("a")], nextCursor: "next" }]);
    expect(data.pageParams).toEqual([undefined]);
  });

  it("resolves the cursor to resume paging from a persisted page", () => {
    const full = [note("a", "2026-08-15T08:00:00"), note("b", "2026-08-14T08:00:00")];
    expect(resolveSeedCursor(full, "stored", 2)).toBe("stored");
    expect(resolveSeedCursor(full, null, 2)).toBeNull();
    expect(resolveSeedCursor(full, undefined, 2)).toBe("2026-08-14T08:00:00");
    expect(resolveSeedCursor(full, undefined, 5)).toBeNull();
  });
});

describe("flattenNotificationGroups", () => {
  it("emits a header item before each group's rows", () => {
    const items = flattenNotificationGroups([
      { key: "today", title: "Today", items: [note("a"), note("b")] },
      { key: "yesterday", title: "Yesterday", items: [note("c")] },
    ]);
    expect(items.map((item) => `${item.kind}:${item.id}`)).toEqual([
      "header:header:today",
      "row:a",
      "row:b",
      "header:header:yesterday",
      "row:c",
    ]);
    expect(items[0]).toMatchObject({ isFirst: true });
    expect(items[3]).toMatchObject({ isFirst: false });
  });
});

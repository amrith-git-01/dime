import type { AppNotification } from "../../types";
import {
  normalizeNotification,
  normalizeNotificationKind,
} from "../normalizeNotification";

const base: AppNotification = {
  id: "n1",
  kind: "transaction_auto",
  title: "Title",
  body: "Body",
  createdAt: "2026-11-01T00:00:00Z",
  readAt: null,
  action: { type: "none" },
};

describe("normalizeNotificationKind", () => {
  it("keeps every known kind", () => {
    for (const kind of [
      "transaction_auto",
      "budget_threshold",
      "capture_failed",
      "report_ready",
      "reminder_due",
    ]) {
      expect(normalizeNotificationKind(kind)).toBe(kind);
    }
  });

  it("turns anything else into unknown", () => {
    expect(normalizeNotificationKind("weekly_wrapped")).toBe("unknown");
    expect(normalizeNotificationKind("unknown")).toBe("unknown");
    expect(normalizeNotificationKind(undefined)).toBe("unknown");
    expect(normalizeNotificationKind(7)).toBe("unknown");
  });
});

describe("normalizeNotification (rows read back from the device)", () => {
  it("leaves a valid row alone", () => {
    const row: AppNotification = {
      ...base,
      kind: "report_ready",
      action: { type: "report", periodKey: "2026-10" },
    };
    expect(normalizeNotification(row)).toEqual(row);
  });

  it("maps a kind from a newer build to unknown", () => {
    const row = { ...base, kind: "future_kind" } as unknown as AppNotification;
    expect(normalizeNotification(row).kind).toBe("unknown");
  });

  it("drops an action it cannot handle", () => {
    const withAction = (action: unknown) =>
      normalizeNotification({ ...base, action } as unknown as AppNotification)
        .action;
    expect(withAction({ type: "teleport" })).toEqual({ type: "none" });
    expect(withAction({ type: "report" })).toEqual({ type: "none" });
    expect(withAction({ type: "transaction_detail" })).toEqual({ type: "none" });
    expect(withAction(undefined)).toEqual({ type: "none" });
  });

  it("keeps a reminder action with its id, or without one", () => {
    const withAction = (action: unknown) =>
      normalizeNotification({
        ...base,
        kind: "reminder_due",
        action,
      } as unknown as AppNotification).action;
    expect(withAction({ type: "reminder", reminderId: "r1" })).toEqual({
      type: "reminder",
      reminderId: "r1",
    });
    // A recurring item's lead reminder has no id: the list opens without a highlight.
    expect(withAction({ type: "reminder", reminderId: null })).toEqual({
      type: "reminder",
      reminderId: null,
    });
    expect(withAction({ type: "reminder" })).toEqual({ type: "reminder", reminderId: null });
    expect(withAction({ type: "reminder", reminderId: 7 })).toEqual({
      type: "reminder",
      reminderId: null,
    });
  });

  it("keeps the simple actions", () => {
    expect(
      normalizeNotification({ ...base, action: { type: "home" } }).action,
    ).toEqual({ type: "home" });
    expect(
      normalizeNotification({ ...base, action: { type: "manual_add" } }).action,
    ).toEqual({ type: "manual_add" });
  });

  it("replaces non-string copy with empty strings", () => {
    const row = { ...base, title: null, body: 3 } as unknown as AppNotification;
    expect(normalizeNotification(row)).toMatchObject({ title: "", body: "" });
  });
});

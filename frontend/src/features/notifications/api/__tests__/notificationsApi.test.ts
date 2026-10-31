import { mapNotificationDto, type NotificationDto } from "../notificationsApi";

jest.mock("@/lib/api/dimeApi", () => ({ dimeApi: { get: jest.fn() } }));

const dto: NotificationDto = {
  id: "n1",
  kind: "budget_threshold",
  title: "Heads up",
  body: "80% of your budget",
  created_at: "2026-11-01T00:00:00Z",
  read_at: null,
  action: { type: "none", transaction_id: null },
};

describe("mapNotificationDto", () => {
  it("maps a known kind and the existing actions", () => {
    expect(mapNotificationDto(dto)).toEqual({
      id: "n1",
      kind: "budget_threshold",
      title: "Heads up",
      body: "80% of your budget",
      createdAt: "2026-11-01T00:00:00Z",
      readAt: null,
      action: { type: "none" },
    });
    expect(
      mapNotificationDto({
        ...dto,
        action: { type: "transaction_detail", transaction_id: "t1" },
      }).action,
    ).toEqual({ type: "transaction_detail", transactionId: "t1" });
    expect(
      mapNotificationDto({
        ...dto,
        action: { type: "transaction_detail", transaction_id: null },
      }).action,
    ).toEqual({ type: "none" });
    expect(
      mapNotificationDto({ ...dto, action: { type: "home" } }).action,
    ).toEqual({ type: "home" });
    expect(
      mapNotificationDto({ ...dto, action: { type: "manual_add" } }).action,
    ).toEqual({ type: "manual_add" });
  });

  it("maps report_ready with a report action", () => {
    const mapped = mapNotificationDto({
      ...dto,
      kind: "report_ready",
      action: { type: "report", transaction_id: null, period_key: "2026-10" },
    });
    expect(mapped.kind).toBe("report_ready");
    expect(mapped.action).toEqual({ type: "report", periodKey: "2026-10" });
  });

  it("maps reminder_due with its reminder id", () => {
    const mapped = mapNotificationDto({
      ...dto,
      kind: "reminder_due",
      title: "Rent due in 2 days",
      action: { type: "reminder", transaction_id: null, reminder_id: "r1" },
    });
    expect(mapped.kind).toBe("reminder_due");
    expect(mapped.action).toEqual({ type: "reminder", reminderId: "r1" });
  });

  it("maps a reminder action without an id (recurring lead reminder) to the plain list", () => {
    for (const action of [
      { type: "reminder", transaction_id: null },
      { type: "reminder", transaction_id: null, reminder_id: null },
      { type: "reminder", transaction_id: null, reminder_id: "" },
    ]) {
      expect(mapNotificationDto({ ...dto, kind: "reminder_due", action }).action).toEqual({
        type: "reminder",
        reminderId: null,
      });
    }
  });

  it("falls back to none for a report action without a period key", () => {
    expect(
      mapNotificationDto({
        ...dto,
        action: { type: "report", transaction_id: null, period_key: null },
      }).action,
    ).toEqual({ type: "none" });
    expect(
      mapNotificationDto({ ...dto, action: { type: "report" } }).action,
    ).toEqual({ type: "none" });
  });

  it("does not trust an unknown kind", () => {
    const mapped = mapNotificationDto({ ...dto, kind: "something_new" });
    expect(mapped.kind).toBe("unknown");
    expect(mapped.title).toBe("Heads up");
    expect(mapped.body).toBe("80% of your budget");
  });

  it("falls back to none for an unknown action type or a missing action", () => {
    expect(
      mapNotificationDto({ ...dto, action: { type: "teleport" } }).action,
    ).toEqual({ type: "none" });
    expect(mapNotificationDto({ ...dto, action: null }).action).toEqual({
      type: "none",
    });
    expect(mapNotificationDto({ ...dto, action: undefined }).action).toEqual({
      type: "none",
    });
  });
});

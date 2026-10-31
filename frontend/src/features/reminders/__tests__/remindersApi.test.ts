import { dimeApi } from "@/lib/api/dimeApi";

import {
  completeReminder,
  createReminder,
  deleteReminder,
  fetchReminders,
  mapReminder,
  mapReminders,
  skipReminder,
  updateReminder,
} from "../api/remindersApi";

jest.mock("@/lib/api/dimeApi", () => ({
  dimeApi: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

const get = jest.mocked(dimeApi.get);
const post = jest.mocked(dimeApi.post);
const patch = jest.mocked(dimeApi.patch);
const del = jest.mocked(dimeApi.delete);

const RAW = {
  id: "r1",
  direction: "pay",
  title: "Rent",
  amount: "15000.00",
  counterparty_name: "Landlord",
  upi_id: "landlord@okbank",
  due_date: "2026-11-05",
  cadence: "monthly",
  lead_days: [3, 1],
  effective_lead_days: [3, 1],
  remind_time: "09:30",
  timezone: "Asia/Kolkata",
  status: "open",
  completed_at: null,
  next_fire_at: "2026-11-02T04:00:00.000Z",
  suggested_match: {
    transaction_id: "t1",
    amount: "15000.00",
    display_name: "Landlord",
    date: "2026-11-03",
  },
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("mapReminder", () => {
  it("keeps a complete reminder as it is", () => {
    expect(mapReminder(RAW)).toEqual(RAW);
  });

  it("drops what cannot be shown or acted on", () => {
    expect(mapReminder(null)).toBeNull();
    expect(mapReminder("nope")).toBeNull();
    expect(mapReminder([])).toBeNull();
    expect(mapReminder({ ...RAW, id: "" })).toBeNull();
    expect(mapReminder({ ...RAW, id: 7 })).toBeNull();
    expect(mapReminder({ ...RAW, direction: "lend" })).toBeNull();
    expect(mapReminder({ ...RAW, status: "paused" })).toBeNull();
    expect(mapReminder({ ...RAW, due_date: "soon" })).toBeNull();
    expect(mapReminder({ ...RAW, due_date: "2026-13-45" })).toBeNull();
    expect(mapReminder({ ...RAW, due_date: undefined })).toBeNull();
  });

  it("falls back to defaults for lesser problems instead of throwing", () => {
    const odd = mapReminder({
      id: "r2",
      direction: "receive",
      status: "done",
      due_date: "2026-11-05",
      title: "   ",
      amount: "lots",
      counterparty_name: 3,
      upi_id: "",
      cadence: "fortnightly",
      lead_days: "3,1",
      effective_lead_days: { 0: 1 },
      remind_time: "9am",
      timezone: null,
      suggested_match: { transaction_id: "t9" },
    });
    expect(odd).toEqual({
      id: "r2",
      direction: "receive",
      title: "Reminder",
      amount: null,
      counterparty_name: null,
      upi_id: null,
      due_date: "2026-11-05",
      cadence: "none",
      lead_days: null,
      effective_lead_days: [],
      remind_time: null,
      timezone: "Asia/Kolkata",
      status: "done",
      completed_at: null,
      next_fire_at: null,
      suggested_match: null,
    });
  });

  it("accepts a numeric amount and cleans the lead days", () => {
    const mapped = mapReminder({
      ...RAW,
      amount: 250,
      lead_days: [3, 3, 99, -1, 1.5, "2", 0],
      effective_lead_days: null,
    });
    expect(mapped?.amount).toBe("250");
    expect(mapped?.lead_days).toEqual([3, 0]);
    // Without its own effective list it reads the stored one.
    expect(mapped?.effective_lead_days).toEqual([3, 0]);
  });

  it("repairs a suggestion without a date", () => {
    const mapped = mapReminder({
      ...RAW,
      suggested_match: { transaction_id: "t1", amount: "10.00", date: "yesterday" },
    });
    expect(mapped?.suggested_match).toEqual({
      transaction_id: "t1",
      amount: "10.00",
      display_name: "",
      date: "",
    });
  });
});

describe("mapReminders", () => {
  it("drops unusable rows and reads a non-list as empty", () => {
    expect(mapReminders([RAW, { id: "x" }, null])).toEqual([RAW]);
    expect(mapReminders(undefined)).toEqual([]);
    expect(mapReminders({ items: [RAW] })).toEqual([]);
  });
});

describe("remindersApi calls", () => {
  it("lists a status from /reminders", async () => {
    get.mockResolvedValueOnce({ data: { items: [RAW, { id: "bad" }] } });
    await expect(fetchReminders("done")).resolves.toEqual([RAW]);
    expect(get).toHaveBeenCalledWith("/api/v1/reminders", {
      params: { status: "done", limit: 200 },
    });
  });

  it("lists open reminders by default and tolerates an empty answer", async () => {
    get.mockResolvedValueOnce({ data: undefined });
    await expect(fetchReminders()).resolves.toEqual([]);
    expect(get).toHaveBeenCalledWith("/api/v1/reminders", {
      params: { status: "open", limit: 200 },
    });
  });

  it("creates, updates and deletes", async () => {
    post.mockResolvedValueOnce({ data: RAW });
    const body = { direction: "pay" as const, title: "Rent", due_date: "2026-11-05", timezone: "Asia/Kolkata" };
    await expect(createReminder(body)).resolves.toEqual(RAW);
    expect(post).toHaveBeenCalledWith("/api/v1/reminders", body);

    patch.mockResolvedValueOnce({ data: RAW });
    await updateReminder("r1", { amount: null });
    expect(patch).toHaveBeenCalledWith("/api/v1/reminders/r1", { amount: null });

    del.mockResolvedValueOnce({ data: undefined });
    await deleteReminder("r1");
    expect(del).toHaveBeenCalledWith("/api/v1/reminders/r1");
  });

  it("completes with an empty body, or with the transaction that paid it", async () => {
    post.mockResolvedValue({ data: RAW });
    await completeReminder("r1");
    expect(post).toHaveBeenLastCalledWith("/api/v1/reminders/r1/complete", {});
    await completeReminder("r1", "t1");
    expect(post).toHaveBeenLastCalledWith("/api/v1/reminders/r1/complete", {
      transaction_id: "t1",
    });
  });

  it("skips to the next date", async () => {
    post.mockResolvedValueOnce({ data: RAW });
    await skipReminder("r1");
    expect(post).toHaveBeenCalledWith("/api/v1/reminders/r1/skip", {});
  });

  it("does not fail when the answer to a write is not a reminder", async () => {
    post.mockResolvedValueOnce({ data: { ok: true } });
    await expect(completeReminder("r1")).resolves.toBeNull();
  });
});

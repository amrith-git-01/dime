import type { Reminder } from "../types";
import {
  hasPartPayment,
  isPartPayment,
  partPaymentLine,
  remainingPaise,
  validatePartPayment,
} from "../utils/partPayment";
import { formatInrAmount } from "@/utils/currency";

function reminder(over: Partial<Reminder> = {}): Reminder {
  return {
    id: "r1",
    direction: "pay",
    title: "Rent",
    amount: "1000.00",
    counterparty_name: null,
    upi_id: null,
    due_date: "2026-11-05",
    cadence: "none",
    lead_days: null,
    effective_lead_days: [],
    remind_time: null,
    timezone: "Asia/Kolkata",
    status: "open",
    completed_at: null,
    next_fire_at: null,
    suggested_match: null,
    ...over,
  };
}

describe("part payments", () => {
  it("what is left is the server's remaining, else the whole amount", () => {
    expect(remainingPaise(reminder({ remaining: "700.00" }))).toBe(70_000);
    expect(remainingPaise(reminder())).toBe(100_000);
    expect(remainingPaise(reminder({ amount: null }))).toBeNull();
  });

  it("says what is paid and left only once something was paid", () => {
    expect(partPaymentLine(reminder())).toBeNull();
    const part = reminder({ paid_total: "300.00", remaining: "700.00" });
    expect(hasPartPayment(part)).toBe(true);
    expect(partPaymentLine(part)).toBe(`${formatInrAmount(300)} paid · ${formatInrAmount(700)} left`);
    expect(partPaymentLine(reminder({ paid_total: "1000.00", remaining: "0.00" }))).toBeNull();
    expect(partPaymentLine(reminder({ status: "done", paid_total: "300.00", remaining: "700.00" }))).toBeNull();
  });

  it("knows when an amount leaves part still due", () => {
    expect(isPartPayment(reminder({ remaining: "700.00" }), "300")).toBe(true);
    expect(isPartPayment(reminder({ remaining: "700.00" }), "700")).toBe(false);
    expect(isPartPayment(reminder({ remaining: "700.00" }), undefined)).toBe(false);
    expect(isPartPayment(reminder({ remaining: "700.00" }), "abc")).toBe(false);
  });

  it("validates a typed part payment strictly and against what is still due", () => {
    const r = reminder({ remaining: "700.00" });
    expect(validatePartPayment(r, "300")).toEqual({ ok: true, amount: "300.00" });
    expect(validatePartPayment(r, "1,50.5")).toEqual({ ok: true, amount: "150.50" });
    expect(validatePartPayment(r, "12.345")).toMatchObject({ ok: false });
    expect(validatePartPayment(r, "12abc")).toMatchObject({ ok: false });
    expect(validatePartPayment(r, "0")).toMatchObject({ ok: false });
    expect(validatePartPayment(r, "700.01")).toMatchObject({ ok: false });
    expect(validatePartPayment(r, "700")).toEqual({ ok: true, amount: "700.00" });
  });
});

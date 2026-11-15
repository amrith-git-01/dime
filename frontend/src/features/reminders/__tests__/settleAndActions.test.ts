import { Linking, Share } from "react-native";
import ShareSheet from "react-native-share";
import type { QueryClient } from "@tanstack/react-query";

import { useToastUiStore } from "@/stores/toastUiStore";
import { createTestQueryClient } from "@/test-utils/testQueryClient";

import { completeReminder, fetchReminders } from "../api/remindersApi";
import { reminderQueryKeys } from "../queryKeys";
import type { Reminder } from "../types";
import { writeNudgeQrCard } from "../utils/nudgeQrCard";
import {
  canNudge,
  canPayNow,
  nudgeMessageFor,
  payNow,
  shareNudge,
} from "../utils/reminderActions";
import {
  findSettleMatch,
  offerSettleForTransaction,
  settleMessage,
} from "../utils/settleOffer";

jest.mock("../api/remindersApi", () => ({
  fetchReminders: jest.fn(),
  completeReminder: jest.fn(),
}));
jest.mock("../utils/nudgeQrCard", () => ({ writeNudgeQrCard: jest.fn() }));
jest.mock("react-native-share", () => ({ __esModule: true, default: { open: jest.fn() } }));
const fetchMock = jest.mocked(fetchReminders);
const completeMock = jest.mocked(completeReminder);
const writeCard = jest.mocked(writeNudgeQrCard);
const shareSheet = jest.mocked(ShareSheet.open);

function reminder(over: Partial<Reminder> = {}): Reminder {
  return {
    id: "r1",
    direction: "pay",
    title: "Rent",
    amount: "15000.00",
    counterparty_name: "Landlord",
    upi_id: "landlord@okbank",
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

const MATCH = {
  transaction_id: "t1",
  amount: "15000.00",
  display_name: "Landlord",
  date: "2026-11-03",
};

describe("findSettleMatch", () => {
  it("finds the open reminder whose suggestion is this transaction", () => {
    const list = [
      reminder({ id: "a", suggested_match: { ...MATCH, transaction_id: "other" } }),
      reminder({ id: "b", suggested_match: MATCH }),
      reminder({ id: "c" }),
    ];
    expect(findSettleMatch(list, "t1")?.id).toBe("b");
    expect(findSettleMatch(list, "nope")).toBeNull();
    expect(findSettleMatch([], "t1")).toBeNull();
  });

  it("ignores a reminder that is no longer open", () => {
    expect(findSettleMatch([reminder({ status: "done", suggested_match: MATCH })], "t1")).toBeNull();
  });

  it("words the offer for each direction", () => {
    expect(settleMessage(reminder())).toBe('Looks like this pays "Rent". Mark it paid?');
    expect(settleMessage(reminder({ direction: "receive" }))).toBe(
      'Looks like this is for "Rent". Mark it received?',
    );
  });
});

describe("offerSettleForTransaction (after a manual add)", () => {
  let queryClient: QueryClient;
  const key = reminderQueryKeys.list("u1", "open");

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
    useToastUiStore.setState({ current: null, queue: [] });
  });
  afterEach(() => queryClient.clear());

  it("shows a Settle toast when a reminder looks paid by the new transaction", async () => {
    fetchMock.mockResolvedValue([reminder({ suggested_match: MATCH })]);
    await offerSettleForTransaction(queryClient, "u1", "t1");
    const toast = useToastUiStore.getState().current;
    expect(toast?.message).toBe('Looks like this pays "Rent". Mark it paid?');
    expect(toast?.action?.label).toBe("Settle");
    expect(fetchMock).toHaveBeenCalledWith("open");
  });

  it("completes the reminder with that transaction when Settle is pressed", async () => {
    fetchMock.mockResolvedValue([reminder({ suggested_match: MATCH })]);
    completeMock.mockResolvedValue(null);
    await offerSettleForTransaction(queryClient, "u1", "t1");
    useToastUiStore.getState().current?.action?.onPress?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(completeMock).toHaveBeenCalledWith("r1", "t1");
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    const messages = [useToastUiStore.getState().current, ...useToastUiStore.getState().queue].map(
      (toast) => toast?.message,
    );
    expect(messages).toContain("Marked paid");
  });

  it("says so when settling fails", async () => {
    fetchMock.mockResolvedValue([reminder({ suggested_match: MATCH })]);
    completeMock.mockRejectedValue(new Error("boom"));
    await offerSettleForTransaction(queryClient, "u1", "t1");
    useToastUiStore.getState().current?.action?.onPress?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const messages = [useToastUiStore.getState().current, ...useToastUiStore.getState().queue].map(
      (toast) => toast?.message,
    );
    expect(messages.some((m) => m?.startsWith("Couldn't update the reminder"))).toBe(true);
  });

  it("stays quiet when nothing matches", async () => {
    fetchMock.mockResolvedValue([reminder({ suggested_match: { ...MATCH, transaction_id: "x" } })]);
    await offerSettleForTransaction(queryClient, "u1", "t1");
    expect(useToastUiStore.getState().current).toBeNull();
  });

  it("does not ask again right after a list that was empty moments ago", async () => {
    queryClient.setQueryData(key, []);
    await offerSettleForTransaction(queryClient, "u1", "t1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks when the cache is unknown or its empty list is old (nothing is read from disk)", async () => {
    fetchMock.mockResolvedValue([]);
    await offerSettleForTransaction(queryClient, "u1", "t1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    queryClient.setQueryData(key, [], { updatedAt: Date.now() - 10 * 60 * 1000 });
    await offerSettleForTransaction(queryClient, "u1", "t1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a double tap on Settle posts /complete once", async () => {
    fetchMock.mockResolvedValue([reminder({ suggested_match: MATCH })]);
    let release!: () => void;
    completeMock.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve(null);
      }),
    );
    await offerSettleForTransaction(queryClient, "u1", "t1");
    const action = useToastUiStore.getState().current?.action;
    action?.onPress?.();
    action?.onPress?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(completeMock).toHaveBeenCalledTimes(1);
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Once it has finished, the same reminder can be settled again (e.g. after a failure).
    completeMock.mockResolvedValue(null);
    action?.onPress?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(completeMock).toHaveBeenCalledTimes(2);
  });

  it("does nothing without a user", async () => {
    await offerSettleForTransaction(queryClient, undefined, "t1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws or toasts when the lookup fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(offerSettleForTransaction(queryClient, "u1", "t1")).resolves.toBeUndefined();
    expect(useToastUiStore.getState().current).toBeNull();
  });
});

describe("Pay now", () => {
  const open = jest.spyOn(Linking, "openURL");

  beforeEach(() => {
    open.mockReset();
  });

  it("needs a UPI id and an amount on an open payment", () => {
    expect(canPayNow(reminder())).toBe(true);
    expect(canPayNow(reminder({ upi_id: null }))).toBe(false);
    expect(canPayNow(reminder({ amount: null }))).toBe(false);
    expect(canPayNow(reminder({ upi_id: "bad" }))).toBe(false);
    expect(canPayNow(reminder({ direction: "receive" }))).toBe(false);
    expect(canPayNow(reminder({ status: "done" }))).toBe(false);
  });

  it("opens the upi:// address", async () => {
    open.mockResolvedValue(true);
    await expect(payNow(reminder())).resolves.toBe("opened");
    expect(open).toHaveBeenCalledWith(
      "upi://pay?pa=landlord@okbank&pn=Landlord&am=15000.00&cu=INR&tn=Rent%20(due%205%20Nov)",
    );
  });

  it("is unavailable, not a crash, when no UPI app can open it", async () => {
    open.mockRejectedValue(new Error("Unable to open URL"));
    await expect(payNow(reminder())).resolves.toBe("unavailable");
  });

  it("does not try to open anything for an unusable reminder", async () => {
    await expect(payNow(reminder({ upi_id: null }))).resolves.toBe("invalid");
    expect(open).not.toHaveBeenCalled();
  });
});

describe("Nudge", () => {
  const share = jest.spyOn(Share, "share");
  const today = new Date(2026, 9, 31, 12);
  const receive = reminder({
    id: "r9",
    direction: "receive",
    title: "Dinner split",
    amount: "800.00",
    counterparty_name: "Ravi",
    due_date: "2026-11-03",
    upi_id: null,
  });

  const context = { level: "gentle" as const, myUpiId: "me@okbank", myName: "Amrith", today };

  beforeEach(() => {
    share.mockReset();
    share.mockResolvedValue({ action: "sharedAction" });
    writeCard.mockReset();
    writeCard.mockResolvedValue("file:///cache/nudge-qr-card.png");
    shareSheet.mockReset();
    shareSheet.mockResolvedValue({ success: true, message: "" });
  });

  it("is offered for money someone owes, while it is open", () => {
    expect(canNudge(receive)).toBe(true);
    expect(canNudge({ ...receive, status: "done" })).toBe(false);
    expect(canNudge(reminder())).toBe(false);
  });

  it("builds the message without any link", () => {
    const message = nudgeMessageFor(receive, context);
    expect(message).toContain("Hi Ravi,");
    expect(message).toContain("₹800 for Dinner split");
    expect(message).not.toMatch(/https?:|Pay here/);
  });

  it("shares the QR card with the message as its caption", async () => {
    await expect(shareNudge(receive, context)).resolves.toBe(true);
    const card = writeCard.mock.calls[0]![0];
    // The QR carries exactly the upi:// address Pay now would open.
    expect(card.payload).toBe(
      "upi://pay?pa=me@okbank&pn=Amrith&am=800.00&cu=INR&tn=Dinner%20split%20(due%203%20Nov)",
    );
    expect(card).toMatchObject({
      title: "Pay ₹800 to Amrith",
      note: "Dinner split (due 3 Nov)",
      upiId: "me@okbank",
    });
    expect(shareSheet).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "file:///cache/nudge-qr-card.png",
        type: "image/png",
        message: nudgeMessageFor(receive, context),
        failOnCancel: false,
      }),
    );
    expect(share).not.toHaveBeenCalled();
  });

  it("titles the card without a name when My name is not known", async () => {
    await shareNudge(receive, { ...context, myName: null });
    expect(writeCard.mock.calls[0]![0].title).toBe("Pay ₹800");
    expect(writeCard.mock.calls[0]![0].payload).not.toContain("pn=");
  });

  it("counts a closed share sheet as shared, not as a failure", async () => {
    shareSheet.mockResolvedValue({ success: false, message: "", dismissedAction: true } as never);
    await expect(shareNudge(receive, context)).resolves.toBe(true);
    expect(share).not.toHaveBeenCalled();
  });

  it("sends the plain text when the share library throws, never an image without its caption", async () => {
    shareSheet.mockRejectedValue(new Error("no activity"));
    await expect(shareNudge(receive, context)).resolves.toBe(true);
    expect(share).toHaveBeenCalledWith({ message: nudgeMessageFor(receive, context) });
  });

  it("sends the plain text when the card cannot be made", async () => {
    writeCard.mockResolvedValue(null);
    await expect(shareNudge(receive, context)).resolves.toBe(true);
    expect(shareSheet).not.toHaveBeenCalled();
    expect(share).toHaveBeenCalledWith({ message: expect.stringContaining("Hi Ravi,") });
  });

  it("makes no card without an amount, without a valid UPI ID or above the limit", async () => {
    for (const [r, c] of [
      [{ ...receive, amount: null }, context],
      [receive, { ...context, myUpiId: null }],
      [receive, { ...context, myUpiId: "bad id" }],
      [{ ...receive, amount: "2000000.00" }, context],
    ] as const) {
      share.mockClear();
      await expect(shareNudge(r, c)).resolves.toBe(true);
      expect(share).toHaveBeenCalledWith({ message: expect.not.stringMatching(/https?:|Pay here/) });
    }
    expect(writeCard).not.toHaveBeenCalled();
    expect(shareSheet).not.toHaveBeenCalled();
  });

  it("reports a share sheet that would not open", async () => {
    share.mockRejectedValue(new Error("no share sheet"));
    await expect(
      shareNudge(receive, { level: "savage", myUpiId: null, myName: null, today }),
    ).resolves.toBe(false);
  });
});

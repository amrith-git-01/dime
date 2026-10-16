import { submitManualTransaction } from "@/features/transactions/api/submitTransactionApi";
import { refreshWidgetSnapshotFromApi } from "@/lib/widgets/refreshWidgetSnapshotFromApi";
import { readWidgetCaptureStatus } from "@/lib/widgets/widgetCaptureMmkv";
import { resetMockMmkv } from "@/test-utils/mockMmkv";

import { addExpense, payeeFor } from "../addExpense";
import { addedText } from "../captureText";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("@/features/transactions/api/submitTransactionApi", () => ({
  submitManualTransaction: jest.fn(),
}));
jest.mock("@/widgets/refreshWidgets", () => ({ refreshWidgets: jest.fn() }));
jest.mock("@/lib/widgets/refreshWidgetSnapshotFromApi", () => ({
  refreshWidgetSnapshotFromApi: jest.fn().mockResolvedValue(true),
}));
jest.mock("@/lib/reportError", () => ({ reportError: jest.fn() }));

const NOW = new Date("2026-10-15T08:30:00.000Z");
const FOOD = { id: "cat-food", name: "Food" };

describe("payeeFor", () => {
  it("uses the typed payee, else the category name, within the server's 200 characters", () => {
    expect(payeeFor("  Swiggy ", "Food")).toBe("Swiggy");
    expect(payeeFor("   ", "Food")).toBe("Food");
    expect(payeeFor("x".repeat(250), "Food")).toHaveLength(200);
  });
});

describe("addExpense", () => {
  beforeEach(() => {
    resetMockMmkv();
    jest.clearAllMocks();
  });

  it("posts one everyday expense dated now, with the card's idempotency key", async () => {
    const text = await addExpense({
      userId: "user-a",
      amountPaise: 25050,
      payee: "Swiggy",
      category: FOOD,
      idempotencyKey: "key-1",
      now: NOW,
    });
    expect(submitManualTransaction).toHaveBeenCalledWith(
      {
        amount: "250.50",
        type: "debit",
        counterparty_name: "Swiggy",
        counterparty_type: "merchant",
        category: "Food",
        category_id: "cat-food",
        note: null,
        transaction_at: NOW.toISOString(),
      },
      "key-1",
    );
    expect(text).toBe(addedText(250.5, "Swiggy"));
  });

  it("names the payee after the category when none is typed, and tells the widget", async () => {
    const text = await addExpense({
      userId: "user-a",
      amountPaise: 2000,
      payee: "",
      category: FOOD,
      idempotencyKey: "key-2",
      now: NOW,
    });
    expect(jest.mocked(submitManualTransaction).mock.calls[0]![0]).toMatchObject({
      counterparty_name: "Food",
    });
    expect(text).toBe(addedText(20, "Food"));
    expect(readWidgetCaptureStatus()).toMatchObject({ kind: "added", text, userId: "user-a" });
  });

  it("returns as soon as the server has the expense, without waiting for the widget snapshot", async () => {
    jest.mocked(refreshWidgetSnapshotFromApi).mockReturnValue(new Promise(() => undefined));
    await expect(
      addExpense({
        userId: "user-a",
        amountPaise: 2000,
        payee: "Chai",
        category: FOOD,
        idempotencyKey: "key-4",
        now: NOW,
      }),
    ).resolves.toBe(addedText(20, "Chai"));
  });

  it("rejects with the message and leaves the widget alone when the server refuses", async () => {
    jest.mocked(submitManualTransaction).mockRejectedValue(new Error("Too many requests."));
    await expect(
      addExpense({
        userId: "user-a",
        amountPaise: 2000,
        payee: "",
        category: FOOD,
        idempotencyKey: "key-3",
        now: NOW,
      }),
    ).rejects.toThrow("Too many requests.");
    expect(readWidgetCaptureStatus()).toBeNull();
  });
});

import { postManualTransaction } from "@/features/transactions/api/submitTransactionApi";
import { getSession } from "@/lib/auth/session";
import { createMMKV, existsMMKV, resetMockMmkv } from "@/test-utils/mockMmkv";

import { removeLegacyWidgetPresets } from "../legacyWidgetData";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("@/features/transactions/api/submitTransactionApi", () => ({
  postManualTransaction: jest.fn(),
}));
jest.mock("@/lib/auth/session", () => ({ getSession: jest.fn() }));
jest.mock("@/lib/reportError", () => ({ reportError: jest.fn() }));

const BODY = { amount: "20.00", type: "debit", counterparty_name: "Chai" };
const item = (key: string, over: Record<string, unknown> = {}) => ({
  key,
  userId: "user-a",
  body: BODY,
  label: "Chai",
  amount: 20,
  createdAt: 1,
  ...over,
});

describe("removeLegacyWidgetPresets", () => {
  beforeEach(() => {
    resetMockMmkv();
    jest.clearAllMocks();
    jest.mocked(getSession).mockReturnValue({ user: { id: "user-a" } } as never);
    jest.mocked(postManualTransaction).mockResolvedValue({});
  });

  it("deletes the 1.1.0 preset store, then does nothing", async () => {
    createMMKV({ id: "widget-presets" }).set("dime:widget-presets", "{}");
    createMMKV({ id: "widget-snapshot" }).set("dime:widget-snapshot", "{}");
    expect(existsMMKV("widget-presets")).toBe(true);

    await removeLegacyWidgetPresets();
    expect(existsMMKV("widget-presets")).toBe(false);
    // Other stores are untouched.
    expect(existsMMKV("widget-snapshot")).toBe(true);

    await expect(removeLegacyWidgetPresets()).resolves.toBeUndefined();
    expect(postManualTransaction).not.toHaveBeenCalled();
  });

  it("sends the taps still queued once, with their own keys and a short timeout, before deleting", async () => {
    createMMKV({ id: "widget-presets" }).set(
      "dime:widget-outbox",
      JSON.stringify([
        item("k1"),
        item("k2", { userId: "user-b" }),
        item("k3", { undoRequested: true }),
      ]),
    );
    await removeLegacyWidgetPresets();
    expect(postManualTransaction).toHaveBeenCalledTimes(1);
    expect(postManualTransaction).toHaveBeenCalledWith(BODY, "k1", { timeout: 5_000 });
    expect(existsMMKV("widget-presets")).toBe(false);
  });

  it("still deletes the store when a send fails or the queue is garbage", async () => {
    jest.mocked(postManualTransaction).mockRejectedValue(new Error("offline"));
    createMMKV({ id: "widget-presets" }).set("dime:widget-outbox", JSON.stringify([item("k1")]));
    await removeLegacyWidgetPresets();
    expect(existsMMKV("widget-presets")).toBe(false);

    createMMKV({ id: "widget-presets" }).set("dime:widget-outbox", "{nope");
    await expect(removeLegacyWidgetPresets()).resolves.toBeUndefined();
    expect(existsMMKV("widget-presets")).toBe(false);
  });
});

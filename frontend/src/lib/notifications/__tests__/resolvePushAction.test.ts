import { resolvePushAction } from "../resolvePushAction";

describe("resolvePushAction", () => {
  it("sends a report push to the report with its period", () => {
    expect(
      resolvePushAction({
        action_type: "report",
        period_key: "2026-10",
        action_transaction_id: "",
      }),
    ).toEqual({ type: "report", periodKey: "2026-10" });
  });

  it("falls back to the inbox for a report push without a usable period", () => {
    expect(resolvePushAction({ action_type: "report" })).toEqual({
      type: "inbox",
    });
    expect(
      resolvePushAction({ action_type: "report", period_key: "october" }),
    ).toEqual({ type: "inbox" });
    expect(
      resolvePushAction({ action_type: "report", period_key: 202610 as never }),
    ).toEqual({ type: "inbox" });
  });

  it("keeps the existing branches", () => {
    expect(resolvePushAction({ action_type: "manual_add" })).toEqual({
      type: "manual_add",
    });
    expect(
      resolvePushAction({
        action_type: "transaction_detail",
        action_transaction_id: "t1",
      }),
    ).toEqual({ type: "transaction", transactionId: "t1" });
    expect(resolvePushAction({ action_type: "home" })).toEqual({
      type: "inbox",
    });
    expect(resolvePushAction({ action_type: "teleport" })).toEqual({
      type: "inbox",
    });
    expect(resolvePushAction(undefined)).toEqual({ type: "inbox" });
  });
});

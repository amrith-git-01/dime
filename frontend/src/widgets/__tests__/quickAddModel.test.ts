import type { WidgetLastAction, WidgetPreset } from "@/lib/widgets/widgetPresetsMmkv";

import {
  buildQuickAddModel,
  QUEUED_STATUS,
  quickAddShowsPresetRow,
} from "../quickAddModel";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

const NOW = 1_000_000_000_000;
const CHAI: WidgetPreset = { label: "Chai", amount: 20, categoryId: "c1" };

function model(overrides: Partial<Parameters<typeof buildQuickAddModel>[0]> = {}) {
  return buildQuickAddModel({
    signedOut: false,
    presets: [CHAI],
    lastAction: null,
    outboxCount: 0,
    heightDp: 150,
    now: NOW,
    ...overrides,
  });
}

function action(overrides: Partial<WidgetLastAction>): WidgetLastAction {
  return {
    kind: "added",
    userId: "user-a",
    label: "Chai",
    amount: 20,
    at: NOW - 1000,
    createdAt: NOW - 1000,
    id: "tx-1",
    key: "k1",
    ...overrides,
  };
}

describe("quick add model", () => {
  it("shows the preset row only when tall enough", () => {
    expect(quickAddShowsPresetRow(70)).toBe(false);
    expect(quickAddShowsPresetRow(150)).toBe(true);
    expect(model({ heightDp: 70 }).showPresetRow).toBe(false);
  });

  it("builds up to the stored presets as 'Label amount' buttons", () => {
    expect(model().presets).toEqual([
      {
        index: 0,
        text: "Chai ₹ 20",
        accessibilityLabel: "Add Chai, ₹ 20",
      },
    ]);
    expect(model().showSetup).toBe(false);
  });

  it("offers setup instead of presets when there are none", () => {
    const quick = model({ presets: [] });
    expect(quick.presets).toEqual([]);
    expect(quick.showSetup).toBe(true);
  });

  it("hides preset amounts when asked", () => {
    expect(model({ hideAmounts: true }).presets[0]!.text).toBe("Chai ₹ ••••");
  });

  it("asks to sign in when signed out", () => {
    const quick = model({ signedOut: true, presets: [] });
    expect(quick.showSetup).toBe(false);
    expect(quick.status).toEqual({ text: "Sign in to Dime", undo: false, opensApp: true });
  });

  describe("status line", () => {
    it("is empty with nothing to report", () => {
      expect(model().status).toBeNull();
    });

    it("shows adding, added with Undo, and undone", () => {
      expect(model({ lastAction: action({ kind: "adding" }) }).status).toMatchObject({
        text: "Adding ₹ 20 · Chai…",
        undo: false,
      });
      expect(model({ lastAction: action({}) }).status).toMatchObject({
        text: "Added ₹ 20 · Chai",
        undo: true,
      });
      expect(model({ lastAction: action({ kind: "undone" }) }).status?.text).toBe("Undone");
    });

    it("hides Undo after two minutes and when the server sent no id", () => {
      expect(model({ lastAction: action({ createdAt: NOW - 121_000 }) }).status?.undo).toBe(false);
      const { id: _id, ...noId } = action({});
      expect(model({ lastAction: noId }).status?.undo).toBe(false);
    });

    it("shows queued (with Undo) and failed", () => {
      expect(model({ lastAction: action({ kind: "queued", id: undefined }) }).status).toEqual({
        text: QUEUED_STATUS,
        undo: true,
        opensApp: false,
      });
      expect(model({ lastAction: action({ kind: "failed" }) }).status?.text).toBe("Couldn't add");
    });

    it("falls back to queued while the outbox still holds taps", () => {
      expect(model({ outboxCount: 2 }).status?.text).toBe(QUEUED_STATUS);
      // An "Adding..." left over by a process that died must not stick.
      expect(
        model({ lastAction: action({ kind: "adding", at: NOW - 61_000 }), outboxCount: 1 }).status
          ?.text,
      ).toBe(QUEUED_STATUS);
    });

    it("shows a duplicate as Already added and an in-flight undo as Undoing", () => {
      expect(model({ lastAction: action({ kind: "duplicate", id: undefined }) }).status).toEqual({
        text: "Already added",
        undo: false,
        opensApp: false,
      });
      expect(model({ lastAction: action({ kind: "undoing" }) }).status).toEqual({
        text: "Undoing…",
        undo: false,
        opensApp: false,
      });
    });

    it("lets an old result go", () => {
      expect(model({ lastAction: action({ at: NOW - 11 * 60_000 }) }).status).toBeNull();
    });

    it("hides the amount in the status when amounts are hidden", () => {
      expect(model({ lastAction: action({}), hideAmounts: true }).status?.text).toBe(
        "Added ₹ •••• · Chai",
      );
    });
  });
});

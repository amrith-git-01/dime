import { DEFAULT_USER_SETTINGS, type UserSettings } from "../types";
import { isTransientSaveError } from "../utils/saveError";
import {
  overlayPendingLayouts,
  patchedLayoutScreens,
  rollbackPatchedKeys,
  snapshotPatchedKeys,
} from "../utils/settingsPatchRollback";

import { AxiosError } from "axios";

const base: UserSettings = {
  ...DEFAULT_USER_SETTINGS,
  weeklyEmailEnabled: true,
  cardLayouts: { home: ["home.recent"], budgets: ["budgets.recurring"] },
};

describe("rollbackPatchedKeys", () => {
  it("restores only the scalar the failed patch changed", () => {
    const patch = { weeklyEmailEnabled: false };
    const snapshot = snapshotPatchedKeys(base, patch);
    // Meanwhile another save changed a different field.
    const current = { ...base, weeklyEmailEnabled: false, monthlyEmailEnabled: false };
    expect(rollbackPatchedKeys(current, patch, snapshot, { keepLayouts: false })).toEqual({
      ...base,
      weeklyEmailEnabled: true,
      monthlyEmailEnabled: false,
    });
  });

  it("does not undo a newer value of the same key", () => {
    const patch = { weeklyEmailEnabled: false };
    const snapshot = snapshotPatchedKeys(base, patch);
    const current = { ...base, weeklyEmailEnabled: true, budgetMonthlyWarnPct: 70 };
    expect(rollbackPatchedKeys(current, patch, snapshot, { keepLayouts: false })).toEqual(current);
  });

  it("restores only the failed screen's order", () => {
    const patch = { cardLayouts: { home: ["home.month"] } };
    const snapshot = snapshotPatchedKeys(base, patch);
    const current: UserSettings = {
      ...base,
      cardLayouts: { home: ["home.month"], budgets: ["budgets.summary"], insights: ["insights.compare"] },
    };
    expect(
      rollbackPatchedKeys(current, patch, snapshot, { keepLayouts: false }).cardLayouts,
    ).toEqual({ home: ["home.recent"], budgets: ["budgets.summary"], insights: ["insights.compare"] });
  });

  it("a screen that had no saved order goes back to having none", () => {
    const patch = { cardLayouts: { insights: ["insights.compare"] } };
    const snapshot = snapshotPatchedKeys(base, patch);
    const current = { ...base, cardLayouts: { ...base.cardLayouts, insights: ["insights.compare"] } };
    expect(rollbackPatchedKeys(current, patch, snapshot, { keepLayouts: false }).cardLayouts).toEqual(
      base.cardLayouts,
    );
  });

  it("keepLayouts leaves every order as it is (the save will be retried), but still undoes scalars", () => {
    const patch = { weeklyEmailEnabled: false, cardLayouts: { home: ["home.month"] } };
    const snapshot = snapshotPatchedKeys(base, patch);
    const current = { ...base, weeklyEmailEnabled: false, cardLayouts: { ...base.cardLayouts, home: ["home.month"] } };
    const out = rollbackPatchedKeys(current, patch, snapshot, { keepLayouts: true });
    expect(out.cardLayouts).toEqual({ home: ["home.month"], budgets: ["budgets.recurring"] });
    expect(out.weeklyEmailEnabled).toBe(true);
  });

  it("a reset patch ([]) counts as touching that screen", () => {
    expect(patchedLayoutScreens({ cardLayouts: { home: [] } })).toEqual(["home"]);
    expect(patchedLayoutScreens({ weeklyEmailEnabled: true })).toEqual([]);
  });
});

describe("overlayPendingLayouts", () => {
  const fresh: UserSettings = { ...DEFAULT_USER_SETTINGS, cardLayouts: { budgets: ["budgets.summary"] } };

  it("takes the pending screens' orders from the local copy, the rest from the server", () => {
    const local: UserSettings = { ...base, cardLayouts: { home: ["home.month"], budgets: ["budgets.recurring"] } };
    expect(overlayPendingLayouts(fresh, local, ["home"]).cardLayouts).toEqual({
      home: ["home.month"],
      budgets: ["budgets.summary"],
    });
  });

  it("a pending screen that the local copy has no order for is removed", () => {
    const local: UserSettings = { ...base, cardLayouts: {} };
    expect(overlayPendingLayouts(fresh, local, ["budgets"]).cardLayouts).toEqual({});
  });

  it("is the server copy when nothing is pending or there is no local copy", () => {
    expect(overlayPendingLayouts(fresh, base, [])).toBe(fresh);
    expect(overlayPendingLayouts(fresh, undefined, ["home"])).toBe(fresh);
  });
});

describe("isTransientSaveError", () => {
  const http = (status: number) =>
    new AxiosError("x", "ERR_BAD_RESPONSE", undefined, undefined, { status } as never);

  it("is true when the server was not reached, or is busy or broken", () => {
    expect(isTransientSaveError(new AxiosError("Network Error", "ERR_NETWORK"))).toBe(true);
    expect(isTransientSaveError(new AxiosError("timeout", "ECONNABORTED"))).toBe(true);
    for (const status of [500, 502, 503, 504, 429, 408]) {
      expect(isTransientSaveError(http(status))).toBe(true);
    }
  });

  it("is false for a rejection", () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(isTransientSaveError(http(status))).toBe(false);
    }
  });

  it("treats an unknown failure as passing", () => {
    expect(isTransientSaveError(new Error("boom"))).toBe(true);
  });
});

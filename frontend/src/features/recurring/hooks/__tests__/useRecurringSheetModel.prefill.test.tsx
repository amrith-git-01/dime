import { createElement, type ReactElement } from "react";

import type { RecurringPrefill } from "../../types";
import { useRecurringSheetModel } from "../useRecurringSheetModel";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("@/lib/haptics/nativeHaptics", () => ({
  triggerHaptic: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/features/toast/useToast", () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));
jest.mock("@/features/categories/hooks/useCategories", () => ({
  useCategories: () => ({ categories: [], isLoading: false }),
}));
const mockCreate = jest.fn();
jest.mock("../useRecurringMutations", () => ({
  useUpdateRecurringMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCreateRecurringMutation: () => ({ mutateAsync: mockCreate, isPending: false }),
  useDeleteRecurringMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
const mockFeedback = jest.fn();
jest.mock("@/features/forecast/api/forecastApi", () => ({
  postPredictionFeedback: (...args: unknown[]) => mockFeedback(...args),
}));

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => Promise<void> | void) => Promise<void>;
  create: (element: ReactElement) => { unmount: () => void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

let model: ReturnType<typeof useRecurringSheetModel> | undefined;
let prefill: RecurringPrefill | undefined;
function Probe() {
  model = useRecurringSheetModel({ kind: "subscription", prefill, onClose: jest.fn() });
  return null;
}
const current = () => {
  if (!model) throw new Error("not rendered");
  return model;
};

async function open(next?: RecurringPrefill) {
  prefill = next;
  let renderer!: { unmount: () => void };
  await act(async () => {
    renderer = create(createElement(Probe));
  });
  return renderer;
}

describe("the add recurring form opened with a prefill", () => {
  beforeEach(() => {
    mockCreate.mockReset().mockResolvedValue(undefined);
    mockFeedback.mockReset().mockResolvedValue(undefined);
  });

  it("starts with the name, amount and cadence it was given, and the category left to pick", async () => {
    const renderer = await open({ name: "Spotify", amount: "119.00", cadence: "yearly" });
    expect(current().form).toMatchObject({
      name: "Spotify",
      amountText: "119",
      cadence: "yearly",
      categoryId: null,
    });
    await act(async () => {
      renderer.unmount();
    });
  });

  it("still lets the user edit what was prefilled", async () => {
    const renderer = await open({ name: "Spotify", amount: "119.00" });
    await act(async () => {
      current().update({ name: "Spotify Premium" });
    });
    expect(current().form.name).toBe("Spotify Premium");
    expect(current().form.amountText).toBe("119");
    await act(async () => {
      renderer.unmount();
    });
  });

  it("starts empty without a prefill", async () => {
    const renderer = await open(undefined);
    expect(current().form.name).toBe("");
    expect(current().form.amountText).toBe("");
    await act(async () => {
      renderer.unmount();
    });
  });

  describe("answering the suggestion it came from", () => {
    const suggestion = { name: "Spotify", amount: "119.00", feedbackPayeeKey: "spotify" };

    async function save(next: RecurringPrefill) {
      const renderer = await open(next);
      await act(async () => {
        current().update({ categoryId: "cat-ent" });
      });
      await act(async () => {
        await current().onSave();
      });
      return renderer;
    }

    it("confirms the suggestion once the item is created", async () => {
      const renderer = await save(suggestion);
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockFeedback).toHaveBeenCalledWith({
        targetKind: "subscription_candidate",
        targetId: "spotify",
        verdict: "confirm",
      });
      await act(async () => {
        renderer.unmount();
      });
    });

    it("says nothing when the editor is left without saving", async () => {
      const renderer = await open(suggestion);
      expect(mockFeedback).not.toHaveBeenCalled();
      await act(async () => {
        renderer.unmount();
      });
      expect(mockFeedback).not.toHaveBeenCalled();
    });

    it("says nothing when the create fails", async () => {
      mockCreate.mockRejectedValue(new Error("nope"));
      const renderer = await save(suggestion);
      expect(mockFeedback).not.toHaveBeenCalled();
      await act(async () => {
        renderer.unmount();
      });
    });

    it("says nothing for an item that did not come from a suggestion", async () => {
      const renderer = await save({ name: "Spotify", amount: "119.00" });
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockFeedback).not.toHaveBeenCalled();
      await act(async () => {
        renderer.unmount();
      });
    });
  });
});

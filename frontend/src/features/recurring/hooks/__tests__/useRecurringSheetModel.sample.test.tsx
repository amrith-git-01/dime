import { createElement, type ReactElement } from "react";

import { TOUR_SAMPLE_ID_PREFIX } from "@/features/tourPreview";

import type { RecurringItem } from "../../types";
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
const mockUpdate = jest.fn(() => Promise.resolve());
const mockCreate = jest.fn(() => Promise.resolve());
const mockDelete = jest.fn(() => Promise.resolve());
jest.mock("../useRecurringMutations", () => ({
  useUpdateRecurringMutation: () => ({ mutateAsync: mockUpdate, isPending: false }),
  useCreateRecurringMutation: () => ({ mutateAsync: mockCreate, isPending: false }),
  useDeleteRecurringMutation: () => ({ mutateAsync: mockDelete, isPending: false }),
}));

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => Promise<void> | void) => Promise<void>;
  create: (element: ReactElement) => { unmount: () => void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

const onClose = jest.fn();
let model: ReturnType<typeof useRecurringSheetModel> | undefined;
let currentItem: RecurringItem | undefined;
function Probe() {
  model = useRecurringSheetModel({ kind: "subscription", item: currentItem, onClose });
  return null;
}
const current = () => {
  if (!model) throw new Error("not rendered");
  return model;
};

function item(id: string): RecurringItem {
  return {
    id,
    kind: "subscription",
    name: "Netflix",
    amount: "649.00",
    category_id: "c1",
    category: "Subscriptions",
    category_icon_name: "Repeat",
    category_color: "#A78BFA",
    cadence: "monthly",
    day_of_month: 3,
    month_of_year: null,
    timezone: "Asia/Kolkata",
    next_due_date: "2026-11-03",
    active: true,
    note: null,
    monthly_equivalent: "649.00",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
  };
}

async function open(next: RecurringItem) {
  currentItem = next;
  let renderer: { unmount: () => void } | undefined;
  await act(async () => {
    renderer = create(createElement(Probe));
  });
  return renderer!;
}

describe("a recurring item opened from the tour's sample data", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("is looked at, never saved: Save closes the page without calling the API", async () => {
    const renderer = await open(item(`${TOUR_SAMPLE_ID_PREFIX}0000-4000-8000-000000001001`));
    await act(async () => {
      current().onSave();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it("is never deleted either", async () => {
    const renderer = await open(item(`${TOUR_SAMPLE_ID_PREFIX}0000-4000-8000-000000001001`));
    await act(async () => {
      current().onDeleteConfirm();
    });
    expect(mockDelete).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => {
      renderer.unmount();
    });
  });

  it("a real item still deletes", async () => {
    const renderer = await open(item("real-item-1"));
    await act(async () => {
      current().onDeleteConfirm();
    });
    expect(mockDelete).toHaveBeenCalledWith("real-item-1");
    await act(async () => {
      renderer.unmount();
    });
  });
});

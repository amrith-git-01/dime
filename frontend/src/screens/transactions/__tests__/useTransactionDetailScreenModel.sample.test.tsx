import { createElement, type ReactElement } from "react";

import { TOUR_SAMPLE_ID_PREFIX } from "@/features/tourPreview";
import type { TransactionRow } from "@/features/transactions/types";

import { useTransactionDetailScreenModel } from "../useTransactionDetailScreenModel";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("@/lib/haptics/nativeHaptics", () => ({
  triggerHaptic: jest.fn(() => Promise.resolve()),
}));

const mockNavigation = { goBack: jest.fn(), replace: jest.fn() };
let mockRow: TransactionRow;
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: { transaction: mockRow } }),
}));
jest.mock("@/features/toast/useToast", () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));
jest.mock("@/features/transactions/hooks/useTransactionDetailQuery", () => ({
  useTransactionDetailQuery: (initial: TransactionRow) => ({ data: initial }),
}));
const mockDelete = jest.fn(() => Promise.resolve());
jest.mock("@/features/transactions/hooks/useDeleteTransactionMutation", () => ({
  useDeleteTransactionMutation: () => ({ mutateAsync: mockDelete, isPending: false }),
}));

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => Promise<void> | void) => Promise<void>;
  create: (element: ReactElement) => { unmount: () => void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

let model: ReturnType<typeof useTransactionDetailScreenModel> | undefined;
function Probe() {
  model = useTransactionDetailScreenModel();
  return null;
}
const current = () => {
  if (!model) throw new Error("not rendered");
  return model;
};

async function open(row: TransactionRow) {
  mockRow = row;
  let renderer: { unmount: () => void } | undefined;
  await act(async () => {
    renderer = create(createElement(Probe));
  });
  return renderer!;
}

describe("a transaction opened from the tour's sample data", () => {
  const sampleRow = {
    id: `${TOUR_SAMPLE_ID_PREFIX}0000-4000-8000-000000000100`,
    merchant: "Chai",
  } as TransactionRow;
  const realRow = { id: "real-1", merchant: "Chai" } as TransactionRow;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("is read-only: Edit and Delete do nothing and say they are off", async () => {
    const renderer = await open(sampleRow);
    expect(current().isSample).toBe(true);

    await act(async () => {
      current().handleEdit();
      current().handleDeletePress();
    });
    expect(mockNavigation.replace).not.toHaveBeenCalled();
    expect(current().confirmVisible).toBe(false);

    await act(async () => {
      current().handleConfirmDelete();
    });
    expect(mockDelete).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it("can still be closed", async () => {
    const renderer = await open(sampleRow);
    await act(async () => {
      current().handleDismiss();
    });
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
    await act(async () => {
      renderer.unmount();
    });
  });

  it("a real transaction edits and deletes as before", async () => {
    const renderer = await open(realRow);
    expect(current().isSample).toBe(false);

    await act(async () => {
      current().handleEdit();
    });
    expect(mockNavigation.replace).toHaveBeenCalledWith("EditTransaction", {
      transaction: realRow,
    });

    await act(async () => {
      current().handleDeletePress();
    });
    expect(current().confirmVisible).toBe(true);
    await act(async () => {
      current().handleConfirmDelete();
    });
    expect(mockDelete).toHaveBeenCalledWith("real-1");
    await act(async () => {
      renderer.unmount();
    });
  });
});

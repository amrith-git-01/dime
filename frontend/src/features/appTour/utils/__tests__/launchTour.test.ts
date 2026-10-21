import { useAddTransactionFabStore } from "@/stores/addTransactionFabStore";

import { useAppTourStore } from "../../store/appTourStore";
import { launchTour } from "../launchTour";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("@/lib/haptics/nativeHaptics", () => ({
  triggerConfirmHaptic: jest.fn(() => Promise.resolve()),
  triggerTickHaptic: jest.fn(() => Promise.resolve()),
  triggerHaptic: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/stores/authSessionStore", () => ({
  useAuthSessionStore: {
    getState: () => ({ userId: "user-a" }),
    subscribe: () => () => undefined,
  },
}));

describe("launchTour", () => {
  beforeEach(() => {
    useAppTourStore.setState({ active: false, autoStartSuppressed: false });
    useAddTransactionFabStore.setState({ fabOpen: true });
  });

  it("starts the tour, closes the + menu, and keeps the first-run tour from starting itself afterwards", () => {
    launchTour("budgets");
    expect(useAppTourStore.getState()).toMatchObject({ active: true, tourId: "budgets" });
    expect(useAppTourStore.getState().autoStartSuppressed).toBe(true);
    expect(useAddTransactionFabStore.getState().fabOpen).toBe(false);
  });

  it("leaves a tour that is already running alone", () => {
    launchTour("home");
    launchTour("budgets");
    expect(useAppTourStore.getState().tourId).toBe("home");
  });
});

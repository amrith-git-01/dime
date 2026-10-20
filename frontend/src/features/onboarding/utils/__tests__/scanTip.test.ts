import { resetMockMmkv } from "@/test-utils/mockMmkv";

import { SCAN_TIP_MESSAGE, takeScanTip } from "../scanTip";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

let mockTourActive = false;
jest.mock("@/features/appTour/store/appTourStore", () => ({
  useAppTourStore: { getState: () => ({ active: mockTourActive }) },
}));

beforeEach(() => {
  resetMockMmkv();
  mockTourActive = false;
});

describe("takeScanTip", () => {
  it("gives the tip once per device", () => {
    expect(takeScanTip()).toBe(SCAN_TIP_MESSAGE);
    expect(takeScanTip()).toBeNull();
  });

  it("holds the tip back while the tour runs, without using it up", () => {
    mockTourActive = true;
    expect(takeScanTip()).toBeNull();
    mockTourActive = false;
    expect(takeScanTip()).toBe(SCAN_TIP_MESSAGE);
  });
});

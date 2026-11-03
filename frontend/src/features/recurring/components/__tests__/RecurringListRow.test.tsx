import {
  press,
  pressables,
  renderTree,
  unmountTree,
} from "@/features/brokeReport/components/__tests__/testHarness";
import type { RecurringItem } from "@/features/recurring/types";
import { ThemeProvider } from "@/theme/ThemeProvider";

import { RecurringListRow } from "../RecurringListRow";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("@/lib/haptics/nativeHaptics", () => ({
  triggerHaptic: jest.fn(() => Promise.resolve()),
}));

const TODAY = new Date(2026, 9, 31, 10, 0);

const NETFLIX: RecurringItem = {
  id: "rec1",
  kind: "subscription",
  name: "Netflix",
  amount: "649.00",
  category_id: null,
  category: null,
  category_icon_name: null,
  category_color: null,
  cadence: "monthly",
  day_of_month: 5,
  month_of_year: null,
  timezone: "Asia/Kolkata",
  next_due_date: "2026-11-05",
  active: true,
  note: null,
  monthly_equivalent: "649.00",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const wrap = (element: React.ReactElement) => <ThemeProvider>{element}</ThemeProvider>;

describe("RecurringListRow", () => {
  it("without onEdit it is one tappable row with no pencil", async () => {
    const onPress = jest.fn();
    const tree = await renderTree(
      wrap(<RecurringListRow item={NETFLIX} today={TODAY} onPress={onPress} />),
    );
    expect(pressables(tree, "Edit Netflix")).toHaveLength(0);
    expect(
      pressables(tree, "View transactions for Netflix"),
    ).toHaveLength(0);
    unmountTree(tree);
  });

  it("with onEdit the row views the item's transactions and the pencil edits it", async () => {
    const onPress = jest.fn();
    const onEdit = jest.fn();
    const tree = await renderTree(
      wrap(<RecurringListRow item={NETFLIX} today={TODAY} onPress={onPress} onEdit={onEdit} />),
    );
    press(tree, "View transactions for Netflix");
    expect(onPress).toHaveBeenCalledWith(NETFLIX);
    expect(onEdit).not.toHaveBeenCalled();

    press(tree, "Edit Netflix");
    expect(onEdit).toHaveBeenCalledWith(NETFLIX);
    expect(onPress).toHaveBeenCalledTimes(1);
    unmountTree(tree);
  });
});

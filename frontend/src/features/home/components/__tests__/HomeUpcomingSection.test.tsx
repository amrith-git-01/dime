import {
  press,
  pressText,
  renderTree,
  textsOf,
  unmountTree,
} from "@/features/brokeReport/components/__tests__/testHarness";
import type { RecurringItem } from "@/features/recurring/types";
import type { Reminder } from "@/features/reminders/types";
import { selectUpcomingEntries } from "@/features/reminders/utils/upcomingMerge";
import { ThemeProvider } from "@/theme/ThemeProvider";

import { HomeUpcomingSection } from "../HomeUpcomingSection";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));
jest.mock("@/lib/haptics/nativeHaptics", () => ({
  triggerHaptic: jest.fn(() => Promise.resolve()),
}));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("react-native-reanimated/mock"),
  LinearTransition: {
    springify: () => ({ damping: () => ({ stiffness: () => ({ mass: () => ({}) }) }) }),
  },
}));

// The recurring barrel also holds its editor (and with it all of Settings); the row alone is enough here.
jest.mock("@/features/recurring/components", () => ({
  RecurringListRow: jest.requireActual("@/features/recurring/components/RecurringListRow").RecurringListRow,
}));

const TODAY = new Date(2026, 9, 31, 10, 0);

const REMINDER: Reminder = {
  id: "r1",
  direction: "pay",
  title: "Credit card bill",
  amount: "4200.00",
  counterparty_name: null,
  upi_id: null,
  due_date: "2026-11-02",
  cadence: "none",
  lead_days: null,
  effective_lead_days: [],
  remind_time: null,
  timezone: "Asia/Kolkata",
  status: "open",
  completed_at: null,
  next_fire_at: null,
  suggested_match: null,
};

const RENT: RecurringItem = {
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

function handlers() {
  return {
    onItemPress: jest.fn(),
    onReminderPress: jest.fn(),
    onSeeAll: jest.fn(),
    onAdd: jest.fn(),
  };
}

describe("HomeUpcomingSection", () => {
  it("renders nothing when there is nothing upcoming", async () => {
    const tree = await renderTree(
      wrap(<HomeUpcomingSection entries={[]} today={TODAY} {...handlers()} />),
    );
    expect(tree.toJSON()).toBeNull();
    unmountTree(tree);
  });

  it("shows a reminder on its own, with no recurring items at all", async () => {
    const entries = selectUpcomingEntries({ recurring: [], reminders: [REMINDER], today: TODAY });
    const tree = await renderTree(
      wrap(<HomeUpcomingSection entries={entries} today={TODAY} {...handlers()} />),
    );
    const texts = textsOf(tree);
    expect(texts).toContain("Upcoming");
    expect(texts).toContain("Credit card bill");
    expect(texts).toContain("Due in 2 days");
    unmountTree(tree);
  });

  it("merges both kinds in date order and keeps each row's tap behaviour", async () => {
    const props = handlers();
    const entries = selectUpcomingEntries({
      recurring: [RENT],
      reminders: [REMINDER],
      today: TODAY,
    });
    const tree = await renderTree(
      wrap(<HomeUpcomingSection entries={entries} today={TODAY} {...props} />),
    );
    const texts = textsOf(tree);
    expect(texts.indexOf("Credit card bill")).toBeLessThan(texts.indexOf("Netflix"));

    pressText(tree, "Netflix");
    expect(props.onItemPress).toHaveBeenCalledWith(RENT);
    expect(props.onReminderPress).not.toHaveBeenCalled();

    pressText(tree, "Credit card bill");
    expect(props.onReminderPress).toHaveBeenCalledWith(REMINDER);
    unmountTree(tree);
  });

  it("has See all and a plus in the header", async () => {
    const props = handlers();
    const entries = selectUpcomingEntries({ recurring: [RENT], reminders: [], today: TODAY });
    const tree = await renderTree(
      wrap(<HomeUpcomingSection entries={entries} today={TODAY} {...props} />),
    );
    press(tree, "See all reminders");
    expect(props.onSeeAll).toHaveBeenCalledTimes(1);
    press(tree, "Add a reminder");
    expect(props.onAdd).toHaveBeenCalledTimes(1);
    unmountTree(tree);
  });

  it("shows no reminder action buttons on Home", async () => {
    const entries = selectUpcomingEntries({ recurring: [], reminders: [REMINDER], today: TODAY });
    const tree = await renderTree(
      wrap(<HomeUpcomingSection entries={entries} today={TODAY} {...handlers()} />),
    );
    expect(textsOf(tree)).not.toContain("Mark paid");
    unmountTree(tree);
  });
});

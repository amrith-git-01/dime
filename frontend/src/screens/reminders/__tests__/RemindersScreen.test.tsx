import {
  pressText,
  renderTree,
  textsOf,
  unmountTree,
} from "@/features/brokeReport/components/__tests__/testHarness";
import type { Reminder } from "@/features/reminders/types";
import { ThemeProvider } from "@/theme/ThemeProvider";

import RemindersScreen from "../RemindersScreen";

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

const REMINDER: Reminder = {
  id: "r1",
  direction: "pay",
  title: "Rent",
  amount: "15000.00",
  counterparty_name: "Landlord",
  upi_id: null,
  due_date: "2026-11-05",
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

const mockModel = { value: {} as Record<string, unknown> };
jest.mock("../useRemindersScreenModel", () => ({
  useRemindersScreenModel: () => mockModel.value,
}));

function model(over: Record<string, unknown> = {}) {
  return {
    today: new Date(2026, 9, 31),
    sections: [{ id: "dueSoon", title: "Due soon", items: [REMINDER] }],
    openCount: 1,
    doneItems: [],
    doneExpanded: false,
    doneLoading: false,
    doneError: false,
    isLoading: false,
    isError: false,
    highlightedId: null,
    busyId: null,
    pendingDelete: null,
    deleting: false,
    onRetry: jest.fn(),
    onRetryDone: jest.fn(),
    toggleDone: jest.fn(),
    onAdd: jest.fn(),
    onEdit: jest.fn(),
    onMarkDone: jest.fn(),
    onSkip: jest.fn(),
    onReopen: jest.fn(),
    onPayNow: jest.fn(),
    onNudge: jest.fn(),
    onDeletePress: jest.fn(),
    onDeleteCancel: jest.fn(),
    onDeleteConfirm: jest.fn(),
    ...over,
  };
}

const wrap = (element: React.ReactElement) => <ThemeProvider>{element}</ThemeProvider>;

describe("RemindersScreen", () => {
  it("lists the reminders without a dialog", async () => {
    mockModel.value = model();
    const tree = await renderTree(wrap(<RemindersScreen />));
    const texts = textsOf(tree);
    expect(texts).toContain("Due soon");
    expect(texts).toContain("Rent");
    expect(texts).not.toContain("Delete this reminder?");
    unmountTree(tree);
  });

  it("asks before deleting, naming the reminder, and confirms through the model", async () => {
    const m = model({ pendingDelete: REMINDER });
    mockModel.value = m;
    const tree = await renderTree(wrap(<RemindersScreen />));
    const texts = textsOf(tree);
    expect(texts).toContain("Delete this reminder?");
    expect(texts.some((t) => t.startsWith('"Rent" stops reminding you.'))).toBe(true);
    pressText(tree, "Cancel");
    expect(m.onDeleteCancel).toHaveBeenCalled();
    unmountTree(tree);
  });

  it("teaches and offers Add when empty", async () => {
    const m = model({ sections: [], openCount: 0 });
    mockModel.value = m;
    const tree = await renderTree(wrap(<RemindersScreen />));
    expect(textsOf(tree)).toContain("No reminders yet");
    pressText(tree, "Add reminder");
    expect(m.onAdd).toHaveBeenCalled();
    unmountTree(tree);
  });
});

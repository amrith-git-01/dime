import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Text } from "react-native";

import {
  press,
  pressables,
  pressText,
  renderTree,
  runAct,
  textsOf,
  unmountTree,
  type TestNode,
  type TestTree,
} from "@/features/brokeReport/components/__tests__/testHarness";
import { useToastUiStore } from "@/stores/toastUiStore";
import { createTestQueryClient } from "@/test-utils/testQueryClient";
import { ThemeProvider } from "@/theme/ThemeProvider";

import { createReminder, deleteReminder, fetchReminders, updateReminder } from "../../api/remindersApi";
import { reminderQueryKeys } from "../../queryKeys";
import type { Reminder } from "../../types";
import { ReminderEditor } from "../ReminderEditor";

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
  triggerConfirmHaptic: jest.fn(() => Promise.resolve()),
}));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("react-native-reanimated/mock"),
  LinearTransition: {
    springify: () => ({ damping: () => ({ stiffness: () => ({ mass: () => ({}) }) }) }),
  },
}));
jest.mock("@react-native-community/datetimepicker", () => ({
  __esModule: true,
  default: () => null,
  DateTimePickerAndroid: { open: jest.fn() },
}));
// The real amount section pulls in the whole transactions form; the editor only needs its props.
jest.mock("@/features/transactions/components/bento/ManualAddAmountSection", () => {
  const { Text: T, TextInput } = jest.requireActual("react-native");
  return {
    ManualAddAmountSection: ({
      amountText,
      onAmountChange,
      errorMessage,
    }: {
      amountText: string;
      onAmountChange: (text: string) => void;
      errorMessage?: string | null;
    }) => (
      <>
        <TextInput placeholder="amount" value={amountText} onChangeText={onAmountChange} />
        {errorMessage ? <T>{errorMessage}</T> : null}
      </>
    ),
  };
});
jest.mock("@/lib/api/dimeApi", () => ({ dimeApi: {} }));
jest.mock("../../api/remindersApi", () => ({
  ...jest.requireActual("../../api/remindersApi"),
  fetchReminders: jest.fn(),
  createReminder: jest.fn(),
  updateReminder: jest.fn(),
  deleteReminder: jest.fn(),
}));
jest.mock("@/hooks/useSessionUserId", () => ({ useSessionUserId: () => ({ userId: "u1" }) }));
jest.mock("@/features/onboarding/utils/askNotificationsInContext", () => ({
  askNotificationsInContext: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/utils/deviceTimezone", () => ({ getDeviceIanaTimezone: () => "Asia/Kolkata" }));
const mockSettings = {
  value: {
    data: {
      reminderDefaultLeadDays: [3, 1, 0],
      reminderTime: "09:00",
      upiId: null as string | null,
    },
  },
};
jest.mock("@/features/settings/hooks/useUserSettingsQuery", () => ({
  useUserSettingsQuery: () => mockSettings.value,
}));

const create = jest.mocked(createReminder);
const update = jest.mocked(updateReminder);
const remove = jest.mocked(deleteReminder);
const list = jest.mocked(fetchReminders);

const SAVED: Reminder = {
  id: "r1",
  direction: "pay",
  title: "Rent",
  amount: "15000.00",
  counterparty_name: "Landlord",
  upi_id: "landlord@okbank",
  due_date: "2026-11-05",
  cadence: "monthly",
  lead_days: [3, 1],
  effective_lead_days: [3, 1],
  remind_time: "09:30",
  timezone: "Asia/Kolkata",
  status: "open",
  completed_at: null,
  next_fire_at: null,
  suggested_match: null,
};

let queryClient: QueryClient;

function mount(element: React.ReactElement): Promise<TestTree> {
  return renderTree(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>
    </ThemeProvider>,
  );
}

function input(tree: TestTree, placeholder: string): TestNode {
  const node = tree.root.findAll(
    (candidate) =>
      candidate.props.placeholder === placeholder &&
      typeof candidate.props.onChangeText === "function",
  )[0];
  if (!node) {
    throw new Error(`No input with placeholder "${placeholder}"`);
  }
  return node;
}

function type(tree: TestTree, placeholder: string, text: string) {
  const node = input(tree, placeholder);
  runAct(() => {
    (node.props.onChangeText as (value: string) => void)(text);
  });
}

async function save(tree: TestTree, title: string) {
  await runAct(async () => {
    pressText(tree, title);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function toastMessages(): string[] {
  const { current, queue } = useToastUiStore.getState();
  return [current, ...queue].map((toast) => toast?.message ?? "");
}

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = createTestQueryClient();
  // Nothing in the open list by default: the editor falls back to the copy it was opened with.
  list.mockResolvedValue([]);
  useToastUiStore.setState({ current: null, queue: [] });
  mockSettings.value = {
    data: { reminderDefaultLeadDays: [3, 1, 0], reminderTime: "09:00", upiId: null },
  };
});
afterEach(() => queryClient.clear());

describe("ReminderEditor: adding", () => {
  it("shows the form with the user's defaults and an Add button", async () => {
    const tree = await mount(<ReminderEditor onDone={jest.fn()} />);
    const texts = textsOf(tree);
    expect(texts).toContain("I pay");
    expect(texts).toContain("I receive");
    expect(texts).toContain("Once");
    expect(texts).toContain("Monthly");
    expect(texts).toContain("Your default: 3, 1, 0 days before.");
    expect(texts).toContain("Reminder time (your default)");
    expect(texts).toContain("9:00 AM");
    expect(texts).toContain("Add");
    expect(texts).not.toContain("Delete");
    // Their UPI ID is for payments.
    expect(input(tree, "name@bank")).toBeTruthy();
    // Nothing is complained about before the user has tried to save.
    expect(texts).not.toContain("Enter a title.");
    unmountTree(tree);
  });

  it("explains what is missing instead of saving an empty form", async () => {
    const onDone = jest.fn();
    const tree = await mount(<ReminderEditor onDone={onDone} />);
    await save(tree, "Add");
    expect(textsOf(tree)).toContain("Enter a title.");
    expect(create).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    unmountTree(tree);
  });

  it("creates the reminder with the typed values and closes", async () => {
    create.mockResolvedValue(SAVED);
    const onDone = jest.fn();
    const tree = await mount(<ReminderEditor onDone={onDone} />);
    type(tree, "e.g. Rent, Credit card bill", "  Rent ");
    type(tree, "amount", "15000");
    type(tree, "Name", "Landlord");
    type(tree, "name@bank", "landlord@okbank");
    await save(tree, "Add");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0]).toMatchObject({
      direction: "pay",
      title: "Rent",
      amount: "15000.00",
      counterparty_name: "Landlord",
      upi_id: "landlord@okbank",
      cadence: "none",
      timezone: "Asia/Kolkata",
    });
    expect("lead_days" in create.mock.calls[0]![0]).toBe(false);
    expect(onDone).toHaveBeenCalled();
    expect(toastMessages()).toContain("Reminder added");
    unmountTree(tree);
  });

  it("a receivable hides the payee UPI field and points at My UPI ID", async () => {
    const tree = await mount(<ReminderEditor onDone={jest.fn()} />);
    pressText(tree, "I receive");
    expect(() => input(tree, "name@bank")).toThrow();
    expect(
      textsOf(tree).some((t) => t.startsWith("Add your UPI ID in Settings")),
    ).toBe(true);

    mockSettings.value = {
      data: { reminderDefaultLeadDays: [3], reminderTime: "09:00", upiId: "me@okbank" },
    };
    unmountTree(tree);
    const again = await mount(<ReminderEditor onDone={jest.fn()} />);
    pressText(again, "I receive");
    expect(textsOf(again)).toContain("Nudges include a pay link for your UPI ID from Settings.");
    unmountTree(again);
  });

  it("rejects a malformed UPI id on the field", async () => {
    const tree = await mount(<ReminderEditor onDone={jest.fn()} />);
    type(tree, "e.g. Rent, Credit card bill", "Rent");
    type(tree, "name@bank", "nope");
    expect(textsOf(tree)).toContain("Enter a UPI ID like name@bank.");
    await save(tree, "Add");
    expect(create).not.toHaveBeenCalled();
    unmountTree(tree);
  });

  it("picking a day turns the default into the reminder's own list, and Use my default undoes it", async () => {
    create.mockResolvedValue(SAVED);
    const tree = await mount(<ReminderEditor onDone={jest.fn()} />);
    type(tree, "e.g. Rent, Credit card bill", "Rent");
    press(tree, "7 days before");
    expect(textsOf(tree)).toContain("Remind me this many days before it is due.");
    await save(tree, "Add");
    expect(create.mock.calls[0]![0].lead_days).toEqual([7, 3, 1, 0]);
    unmountTree(tree);

    const second = await mount(<ReminderEditor onDone={jest.fn()} />);
    type(second, "e.g. Rent, Credit card bill", "Rent");
    press(second, "7 days before");
    press(second, "Use my default reminder days");
    expect(textsOf(second)).toContain("Your default: 3, 1, 0 days before.");
    await save(second, "Add");
    expect("lead_days" in create.mock.calls[1]![0]).toBe(false);
    unmountTree(second);
  });

  it("dims lead days a weekly repeat cannot use and drops them when the repeat changes", async () => {
    create.mockResolvedValue(SAVED);
    const tree = await mount(<ReminderEditor onDone={jest.fn()} />);
    type(tree, "e.g. Rent, Credit card bill", "Gym");
    press(tree, "7 days before");
    pressText(tree, "Weekly");
    const seven = tree.root.findAll(
      (node) => node.props.accessibilityLabel === "7 days before" && "accessibilityState" in node.props,
    )[0];
    expect(seven?.props.accessibilityState).toMatchObject({ disabled: true });
    await save(tree, "Add");
    expect(create.mock.calls[0]![0]).toMatchObject({ cadence: "weekly", lead_days: [3, 1, 0] });
    unmountTree(tree);
  });

  it("shows the server's reason on the form when it refuses (422)", async () => {
    create.mockRejectedValue(
      new AxiosError("bad", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 422,
        data: { detail: [{ msg: "Lead days can be at most 6 for a weekly reminder" }] },
        statusText: "",
        headers: {},
        config: {} as never,
      }),
    );
    const onDone = jest.fn();
    const tree = await mount(<ReminderEditor onDone={onDone} />);
    type(tree, "e.g. Rent, Credit card bill", "Rent");
    await save(tree, "Add");
    expect(textsOf(tree)).toContain("Lead days can be at most 6 for a weekly reminder");
    expect(onDone).not.toHaveBeenCalled();
    // Typing again clears it.
    type(tree, "e.g. Rent, Credit card bill", "Rent 2");
    expect(textsOf(tree)).not.toContain("Lead days can be at most 6 for a weekly reminder");
    unmountTree(tree);
  });

  it("a network failure is a toast, not a form error", async () => {
    create.mockRejectedValue(new Error("Network Error"));
    const tree = await mount(<ReminderEditor onDone={jest.fn()} />);
    type(tree, "e.g. Rent, Credit card bill", "Rent");
    await save(tree, "Add");
    expect(toastMessages()).toContain("Network Error");
    unmountTree(tree);
  });
});

describe("ReminderEditor: editing", () => {
  it("fills the form from the reminder and offers Delete and Save", async () => {
    const tree = await mount(<ReminderEditor reminder={SAVED} onDone={jest.fn()} />);
    const texts = textsOf(tree);
    expect(texts).toContain("Save");
    expect(texts).toContain("Delete");
    expect(texts).toContain("Remind me this many days before it is due.");
    expect(texts).toContain("Use my default");
    expect(texts).toContain("9:30 AM");
    expect(input(tree, "e.g. Rent, Credit card bill").props.value).toBe("Rent");
    unmountTree(tree);
  });

  it("closes without a request when nothing changed", async () => {
    const onDone = jest.fn();
    const tree = await mount(<ReminderEditor reminder={SAVED} onDone={onDone} />);
    await save(tree, "Save");
    expect(update).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
    unmountTree(tree);
  });

  it("sends only the change", async () => {
    update.mockResolvedValue(SAVED);
    const onDone = jest.fn();
    const tree = await mount(<ReminderEditor reminder={SAVED} onDone={onDone} />);
    type(tree, "e.g. Rent, Credit card bill", "House rent");
    await save(tree, "Save");
    expect(update).toHaveBeenCalledWith("r1", { title: "House rent" });
    expect(onDone).toHaveBeenCalled();
    expect(toastMessages()).toContain("Reminder updated");
    unmountTree(tree);
  });

  it("asks before deleting, then deletes and closes", async () => {
    remove.mockResolvedValue(undefined);
    const onDone = jest.fn();
    const tree = await mount(<ReminderEditor reminder={SAVED} onDone={onDone} />);
    pressText(tree, "Delete");
    expect(textsOf(tree)).toContain("Delete this reminder?");
    expect(remove).not.toHaveBeenCalled();
    await runAct(async () => {
      // The dialog comes first in the tree: its confirm button is the first "Delete" now.
      const deletes = tree.root.findAll(
        (node) => node.type === Text && node.props.children === "Delete",
      );
      let target: TestNode | null = deletes[0] ?? null;
      while (target && typeof target.props.onPress !== "function") {
        target = target.parent;
      }
      (target?.props.onPress as () => void)();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(remove).toHaveBeenCalledWith("r1");
    expect(onDone).toHaveBeenCalled();
    unmountTree(tree);
  });

  it("lets an overdue reminder be edited without touching its date", async () => {
    update.mockResolvedValue(SAVED);
    const overdue = { ...SAVED, due_date: "2020-01-01" };
    const tree = await mount(<ReminderEditor reminder={overdue} onDone={jest.fn()} />);
    type(tree, "e.g. Rent, Credit card bill", "Old rent");
    await save(tree, "Save");
    expect(update).toHaveBeenCalledWith("r1", { title: "Old rent" });
    unmountTree(tree);
  });

  describe("when the reminder moved on while the editor was open", () => {
    // A repeating reminder advanced a month on the server; the copy in the route params is stale.
    const ADVANCED: Reminder = { ...SAVED, due_date: "2026-12-05", next_fire_at: "2026-12-02T04:00:00.000Z" };
    const openKey = reminderQueryKeys.list("u1", "open");

    it("shows the current copy, and an untouched date is never sent as a change", async () => {
      update.mockResolvedValue(ADVANCED);
      queryClient.setQueryData(openKey, [ADVANCED]);
      const tree = await mount(<ReminderEditor reminder={SAVED} onDone={jest.fn()} />);
      expect(pressables(tree, "Due date, Sat 5 Dec 2026").length).toBeGreaterThan(0);
      type(tree, "e.g. Rent, Credit card bill", "House rent");
      await save(tree, "Save");
      expect(update).toHaveBeenCalledTimes(1);
      const [, body] = update.mock.calls[0]!;
      expect(body).toEqual({ title: "House rent" });
      expect("due_date" in body).toBe(false);
      expect("timezone" in body).toBe(false);
      unmountTree(tree);
    });

    it("also holds when it advances after the form is already open", async () => {
      update.mockResolvedValue(ADVANCED);
      const tree = await mount(<ReminderEditor reminder={SAVED} onDone={jest.fn()} />);
      expect(pressables(tree, "Due date, Thu 5 Nov 2026").length).toBeGreaterThan(0);
      type(tree, "e.g. Rent, Credit card bill", "House rent");
      await runAct(async () => {
        queryClient.setQueryData(openKey, [ADVANCED]);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      // The untouched date follows the live copy; the typed title stays.
      expect(pressables(tree, "Due date, Sat 5 Dec 2026").length).toBeGreaterThan(0);
      expect(input(tree, "e.g. Rent, Credit card bill").props.value).toBe("House rent");
      await save(tree, "Save");
      expect(update).toHaveBeenCalledWith("r1", { title: "House rent" });
      unmountTree(tree);
    });

    it("a date the user did pick is sent, against the live copy", async () => {
      update.mockResolvedValue(ADVANCED);
      queryClient.setQueryData(openKey, [ADVANCED]);
      const tree = await mount(<ReminderEditor reminder={SAVED} onDone={jest.fn()} />);
      // Changing the repeat is an edit: it goes with the timezone, but the date still is not touched.
      pressText(tree, "Yearly");
      await save(tree, "Save");
      expect(update).toHaveBeenCalledWith("r1", { cadence: "yearly", timezone: "Asia/Kolkata" });
      unmountTree(tree);
    });

    it("falls back to the opened copy when the reminder is not in the list", async () => {
      queryClient.setQueryData(openKey, [{ ...ADVANCED, id: "someone-else" }]);
      const tree = await mount(<ReminderEditor reminder={SAVED} onDone={jest.fn()} />);
      expect(pressables(tree, "Due date, Thu 5 Nov 2026").length).toBeGreaterThan(0);
      unmountTree(tree);
    });
  });

  it("has a reachable control for every picker (44pt rows)", async () => {
    const tree = await mount(<ReminderEditor reminder={SAVED} onDone={jest.fn()} />);
    expect(pressables(tree, "Due date, Thu 5 Nov 2026").length).toBeGreaterThan(0);
    expect(pressables(tree, "Reminder time, 9:30 AM").length).toBeGreaterThan(0);
    unmountTree(tree);
  });
});

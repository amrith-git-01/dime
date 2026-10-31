import {
  press,
  pressables,
  renderTree,
  runAct,
  textsOf,
  unmountTree,
  type TestTree,
} from "@/features/brokeReport/components/__tests__/testHarness";
import { ThemeProvider } from "@/theme/ThemeProvider";

import {
  SettingsRemindersCard,
  type SettingsRemindersCardProps,
} from "../components/SettingsRemindersCard";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("@/lib/haptics/nativeHaptics", () => ({
  triggerHaptic: jest.fn(() => Promise.resolve()),
}));
jest.mock("@react-native-community/datetimepicker", () => ({
  __esModule: true,
  default: () => null,
  DateTimePickerAndroid: { open: jest.fn() },
}));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("react-native-reanimated/mock"),
  LinearTransition: {
    springify: () => ({ damping: () => ({ stiffness: () => ({ mass: () => ({}) }) }) }),
  },
}));
// The animated switch is a Lottie file; a plain pressable stands in for it.
jest.mock("@/components/ui/LottieToggle/LottieToggle", () => {
  const { Pressable: P } = jest.requireActual("react-native");
  return {
    LOTTIE_TOGGLE_WIDTH: 50,
    LOTTIE_TOGGLE_HEIGHT: 30,
    LottieToggle: ({
      accessibilityLabel,
      value,
      onValueChange,
      disabled,
    }: {
      accessibilityLabel: string;
      value: boolean;
      onValueChange: (next: boolean) => void;
      disabled?: boolean;
    }) => (
      <P
        accessibilityRole="switch"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
        onPress={() => onValueChange(!value)}
      />
    ),
  };
});

function props(over: Partial<SettingsRemindersCardProps> = {}): SettingsRemindersCardProps {
  return {
    enabled: true,
    defaultLeadDays: [3, 1, 0],
    time: "09:00",
    overdueNudges: 2,
    quietEnabled: false,
    quietStart: "22:00",
    quietEnd: "08:00",
    hideAmounts: false,
    upiId: "",
    upiError: null,
    onEnabledChange: jest.fn(),
    onDefaultLeadDayToggle: jest.fn(),
    onTimeChange: jest.fn(),
    onOverdueNudgesChange: jest.fn(),
    onQuietEnabledChange: jest.fn(),
    onQuietStartChange: jest.fn(),
    onQuietEndChange: jest.fn(),
    onHideAmountsChange: jest.fn(),
    onUpiIdChange: jest.fn(),
    ...over,
  };
}

function mount(p: SettingsRemindersCardProps): Promise<TestTree> {
  return renderTree(
    <ThemeProvider>
      <SettingsRemindersCard {...p} />
    </ThemeProvider>,
  );
}

describe("SettingsRemindersCard", () => {
  it("shows every reminder control when reminders are on", async () => {
    const tree = await mount(props());
    const texts = textsOf(tree);
    expect(texts).toEqual(
      expect.arrayContaining([
        "Reminders",
        "Remind me",
        "Reminder time",
        "9:00 AM",
        "Nudges after the due date",
        "Quiet hours",
        "Hide amounts in notifications",
      ]),
    );
    unmountTree(tree);
  });

  it("hides everything but My UPI ID when reminders are off", async () => {
    const tree = await mount(props({ enabled: false }));
    const texts = textsOf(tree);
    expect(texts).not.toContain("Remind me");
    expect(texts).not.toContain("Reminder time");
    expect(texts).not.toContain("Quiet hours");
    expect(texts).toContain("Nudges to people who owe you include a pay link for this ID.");
    unmountTree(tree);
  });

  it("toggles reminders, quiet hours and hidden amounts", async () => {
    const p = props();
    const tree = await mount(p);
    press(tree, "Reminders");
    expect(p.onEnabledChange).toHaveBeenCalledWith(false);
    press(tree, "Quiet hours");
    expect(p.onQuietEnabledChange).toHaveBeenCalledWith(true);
    press(tree, "Hide amounts in notifications");
    expect(p.onHideAmountsChange).toHaveBeenCalledWith(true);
    unmountTree(tree);
  });

  it("picks default lead days and the number of overdue nudges", async () => {
    const p = props();
    const tree = await mount(p);
    press(tree, "5 days before");
    expect(p.onDefaultLeadDayToggle).toHaveBeenCalledWith(5);
    press(tree, "3 overdue nudges");
    expect(p.onOverdueNudgesChange).toHaveBeenCalledWith(3);
    press(tree, "No overdue nudges");
    expect(p.onOverdueNudgesChange).toHaveBeenCalledWith(0);
    press(tree, "1 overdue nudge");
    expect(p.onOverdueNudgesChange).toHaveBeenCalledWith(1);
    unmountTree(tree);
  });

  it("marks the chosen nudge count as selected", async () => {
    const tree = await mount(props({ overdueNudges: 4 }));
    const chip = tree.root.findAll(
      (node) => node.props.accessibilityLabel === "4 overdue nudges" && "accessibilityState" in node.props,
    )[0];
    expect(chip?.props.accessibilityState).toMatchObject({ selected: true });
    unmountTree(tree);
  });

  it("explains an empty default list", async () => {
    const tree = await mount(props({ defaultLeadDays: [] }));
    expect(textsOf(tree)).toContain("No default days. Each reminder can still pick its own.");
    unmountTree(tree);
  });

  it("shows the quiet window only while quiet hours are on", async () => {
    const off = await mount(props());
    expect(textsOf(off)).not.toContain("Quiet from");
    unmountTree(off);

    const p = props({ quietEnabled: true, quietStart: "22:30", quietEnd: "07:15" });
    const on = await mount(p);
    const texts = textsOf(on);
    expect(texts).toEqual(expect.arrayContaining(["Quiet from", "10:30 PM", "Until", "7:15 AM"]));
    expect(pressables(on, "Quiet from, 10:30 PM").length).toBeGreaterThan(0);
    unmountTree(on);
  });

  it("takes My UPI ID and shows what is wrong with it", async () => {
    const p = props({ upiId: "nope", upiError: "Enter a UPI ID like name@bank." });
    const tree = await mount(p);
    expect(textsOf(tree)).toContain("Enter a UPI ID like name@bank.");
    const field = tree.root.findAll(
      (node) => node.props.placeholder === "name@bank" && typeof node.props.onChangeText === "function",
    )[0]!;
    expect(field.props.value).toBe("nope");
    runAct(() => {
      (field.props.onChangeText as (text: string) => void)("me@okbank");
    });
    expect(p.onUpiIdChange).toHaveBeenCalledWith("me@okbank");
    unmountTree(tree);
  });

  it("dims every control while a save is running", async () => {
    const tree = await mount(props({ disabled: true }));
    const chip = tree.root.findAll(
      (node) => node.props.accessibilityLabel === "1 day before" && "accessibilityState" in node.props,
    )[0];
    expect(chip?.props.accessibilityState).toMatchObject({ disabled: true });
    unmountTree(tree);
  });
});

import { ScrollView } from "react-native";

import { ThemeProvider } from "@/theme/ThemeProvider";

import {
  press,
  pressables,
  pressText,
  renderTree,
  runAct,
  textsOf,
  unmountTree,
  updateTree,
  type TestTree,
} from "@/features/brokeReport/components/__tests__/testHarness";

import type { Reminder } from "../../types";
import { LeadDayChips } from "../LeadDayChips";
import { ReminderRow, type ReminderRowProps } from "../ReminderRow";
import { RemindersList, type RemindersListProps } from "../RemindersList";

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

// 31 Oct 2026.
const TODAY = new Date(2026, 9, 31, 10, 0);

function reminder(id: string, over: Partial<Reminder> = {}): Reminder {
  return {
    id,
    direction: "pay",
    title: `Item ${id}`,
    amount: null,
    counterparty_name: null,
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
    ...over,
  };
}

const wrap = (element: React.ReactElement) => <ThemeProvider>{element}</ThemeProvider>;

function rowProps(over: Partial<ReminderRowProps> = {}): ReminderRowProps {
  return {
    reminder: reminder("r1", { title: "Rent", amount: "15000.00", counterparty_name: "Landlord" }),
    today: TODAY,
    onPress: jest.fn(),
    onMarkDone: jest.fn(),
    onPayNow: jest.fn(),
    onNudge: jest.fn(),
    onSkip: jest.fn(),
    onDelete: jest.fn(),
    onReopen: jest.fn(),
    ...over,
  };
}

describe("LeadDayChips", () => {
  const options = [0, 1, 2, 3, 5, 7];

  it("labels each option and reports a tap", async () => {
    const onToggle = jest.fn();
    const tree = await renderTree(
      wrap(<LeadDayChips options={options} selected={[3]} onToggle={onToggle} />),
    );
    expect(textsOf(tree)).toEqual(["On the day", "1 day", "2 days", "3 days", "5 days", "7 days"]);
    press(tree, "2 days before");
    expect(onToggle).toHaveBeenCalledWith(2);
    press(tree, "On the due date");
    expect(onToggle).toHaveBeenCalledWith(0);
    unmountTree(tree);
  });

  it("dims the options above the repeat's cap", async () => {
    const tree = await renderTree(
      wrap(<LeadDayChips options={options} selected={[]} onToggle={jest.fn()} cap={6} />),
    );
    const seven = tree.root.findAll(
      (node) => node.props.accessibilityLabel === "7 days before" && "accessibilityState" in node.props,
    )[0];
    expect(seven?.props.accessibilityState).toMatchObject({ disabled: true });
    const three = tree.root.findAll(
      (node) => node.props.accessibilityLabel === "3 days before" && "accessibilityState" in node.props,
    )[0];
    expect(three?.props.accessibilityState).toMatchObject({ disabled: false });
    unmountTree(tree);
  });

  it("stops offering more once five are chosen, but still lets one be removed", async () => {
    const tree = await renderTree(
      wrap(<LeadDayChips options={[0, 1, 2, 3, 5, 7]} selected={[7, 5, 3, 2, 1]} onToggle={jest.fn()} />),
    );
    const state = (label: string) =>
      tree.root.findAll(
        (node) => node.props.accessibilityLabel === label && "accessibilityState" in node.props,
      )[0]?.props.accessibilityState;
    expect(state("On the due date")).toMatchObject({ disabled: true, selected: false });
    expect(state("1 day before")).toMatchObject({ disabled: false, selected: true });
    unmountTree(tree);
  });
});

describe("ReminderRow (list)", () => {
  it("shows title, who and when, the amount in red for money going out, and a repeat badge", async () => {
    const tree = await renderTree(
      wrap(<ReminderRow {...rowProps({ reminder: reminder("r1", { title: "Rent", amount: "15000.00", counterparty_name: "Landlord", cadence: "monthly" }) })} />),
    );
    const texts = textsOf(tree);
    expect(texts).toContain("Rent");
    expect(texts).toContain("Landlord · Due in 5 days");
    expect(texts.some((t) => t.includes("15,000.00") && t.startsWith("-"))).toBe(true);
    expect(texts).toContain("Monthly");
    unmountTree(tree);
  });

  it("shows money coming in with a plus sign", async () => {
    const tree = await renderTree(
      wrap(<ReminderRow {...rowProps({ reminder: reminder("r2", { direction: "receive", amount: "800.00" }) })} />),
    );
    expect(textsOf(tree).some((t) => t.startsWith("+") && t.includes("800.00"))).toBe(true);
    unmountTree(tree);
  });

  it("omits the amount when there is none and says how late an overdue one is", async () => {
    const tree = await renderTree(
      wrap(<ReminderRow {...rowProps({ reminder: reminder("r3", { due_date: "2026-10-29" }) })} />),
    );
    const texts = textsOf(tree);
    expect(texts).toContain("2 days overdue");
    expect(texts.some((t) => t.includes("₹"))).toBe(false);
    unmountTree(tree);
  });

  it("Mark paid, Pay now (with a UPI id and amount) and the row tap call back", async () => {
    const props = rowProps({
      reminder: reminder("r1", { title: "Rent", amount: "15000.00", upi_id: "landlord@okbank" }),
    });
    const tree = await renderTree(wrap(<ReminderRow {...props} />));
    press(tree, "Mark paid");
    expect(props.onMarkDone).toHaveBeenCalledWith(props.reminder);
    press(tree, "Pay now");
    expect(props.onPayNow).toHaveBeenCalledWith(props.reminder);
    expect(pressables(tree, "Nudge")).toHaveLength(0);
    expect(pressables(tree, "Skip")).toHaveLength(0);
    pressText(tree, "Rent");
    expect(props.onPress).toHaveBeenCalledWith(props.reminder);
    unmountTree(tree);
  });

  it("offers no Pay now without a UPI id or amount", async () => {
    const tree = await renderTree(
      wrap(<ReminderRow {...rowProps({ reminder: reminder("r1", { amount: "10.00" }) })} />),
    );
    expect(pressables(tree, "Pay now")).toHaveLength(0);
    unmountTree(tree);
  });

  it("offers Mark received and Nudge for money someone owes", async () => {
    const props = rowProps({ reminder: reminder("r2", { direction: "receive", amount: "800.00" }) });
    const tree = await renderTree(wrap(<ReminderRow {...props} />));
    press(tree, "Mark received");
    expect(props.onMarkDone).toHaveBeenCalledWith(props.reminder);
    press(tree, "Nudge");
    expect(props.onNudge).toHaveBeenCalledWith(props.reminder);
    expect(pressables(tree, "Pay now")).toHaveLength(0);
    unmountTree(tree);
  });

  it("the Looks paid chip marks it paid with that transaction", async () => {
    const props = rowProps({
      reminder: reminder("r1", {
        title: "Rent",
        amount: "15000.00",
        suggested_match: {
          transaction_id: "t1",
          amount: "15000.00",
          display_name: "Landlord",
          date: "2026-11-03",
        },
      }),
    });
    const tree = await renderTree(wrap(<ReminderRow {...props} />));
    const texts = textsOf(tree);
    expect(texts).toContain("Looks paid");
    expect(texts.some((t) => t.includes("to Landlord on 3 Nov"))).toBe(true);
    // One Mark paid (the chip's): the plain one waits in the more menu.
    expect(texts.filter((t) => t === "Mark paid")).toHaveLength(1);
    press(tree, "Mark paid");
    expect(props.onMarkDone).toHaveBeenCalledWith(props.reminder, "t1");
    press(tree, "More actions for Rent");
    press(tree, "Mark paid, no match");
    expect(props.onMarkDone).toHaveBeenLastCalledWith(props.reminder);
    unmountTree(tree);
  });

  it("the more menu holds Skip (repeating only), Edit and Delete", async () => {
    const props = rowProps({
      reminder: reminder("r1", { title: "Rent", cadence: "monthly" }),
    });
    const tree = await renderTree(wrap(<ReminderRow {...props} />));
    expect(pressables(tree, "Delete")).toHaveLength(0);
    press(tree, "More actions for Rent");
    press(tree, "Skip");
    expect(props.onSkip).toHaveBeenCalledWith(props.reminder);
    press(tree, "Edit");
    expect(props.onPress).toHaveBeenCalledWith(props.reminder);
    press(tree, "Delete");
    expect(props.onDelete).toHaveBeenCalledWith(props.reminder);
    unmountTree(tree);

    const once = rowProps({ reminder: reminder("r2", { title: "Once", cadence: "none" }) });
    const onceTree = await renderTree(wrap(<ReminderRow {...once} />));
    press(onceTree, "More actions for Once");
    expect(pressables(onceTree, "Skip")).toHaveLength(0);
    unmountTree(onceTree);
  });

  it("disables the actions while one is running", async () => {
    const tree = await renderTree(wrap(<ReminderRow {...rowProps({ busy: true })} />));
    const markPaid = pressables(tree, "Mark paid")[0];
    expect(markPaid?.props.disabled).toBe(true);
    unmountTree(tree);
  });

  it("explains the pay limit instead of dropping Pay now silently", async () => {
    const big = rowProps({
      reminder: reminder("r1", { amount: "2500000.00", upi_id: "landlord@okbank" }),
    });
    const tree = await renderTree(wrap(<ReminderRow {...big} />));
    expect(pressables(tree, "Pay now")).toHaveLength(0);
    expect(textsOf(tree)).toContain("Pay now works up to \u20b910,00,000. Use your UPI app for this one.");
    unmountTree(tree);

    const owed = rowProps({
      reminder: reminder("r2", { direction: "receive", amount: "2500000.00" }),
    });
    const owedTree = await renderTree(wrap(<ReminderRow {...owed} />));
    expect(
      textsOf(owedTree).some((t) => t.startsWith("Pay links work up to \u20b910,00,000")),
    ).toBe(true);
    // The nudge itself is still offered.
    press(owedTree, "Nudge");
    expect(owed.onNudge).toHaveBeenCalled();
    unmountTree(owedTree);

    // Nothing to say when the amount is fine, or when there is no UPI id to pay.
    const fine = await renderTree(
      wrap(<ReminderRow {...rowProps({ reminder: reminder("r3", { amount: "900.00", upi_id: "a.b@bank" }) })} />),
    );
    expect(textsOf(fine).some((t) => t.includes("works up to"))).toBe(false);
    unmountTree(fine);
    const noUpi = await renderTree(
      wrap(<ReminderRow {...rowProps({ reminder: reminder("r4", { amount: "2500000.00" }) })} />),
    );
    expect(textsOf(noUpi).some((t) => t.includes("works up to"))).toBe(false);
    unmountTree(noUpi);
  });

  it("a done reminder shows when it was closed and can be reopened or deleted", async () => {
    const props = rowProps({
      reminder: reminder("r1", {
        title: "Rent",
        status: "done",
        completed_at: "2026-10-20T08:00:00.000Z",
      }),
    });
    const tree = await renderTree(wrap(<ReminderRow {...props} />));
    expect(textsOf(tree).some((t) => /^Paid \d{1,2} Oct$/.test(t))).toBe(true);
    expect(pressables(tree, "Mark paid")).toHaveLength(0);
    press(tree, "Reopen");
    expect(props.onReopen).toHaveBeenCalledWith(props.reminder);
    press(tree, "More actions for Rent");
    expect(pressables(tree, "Edit")).toHaveLength(0);
    press(tree, "Delete");
    expect(props.onDelete).toHaveBeenCalled();
    unmountTree(tree);
  });

  it("reads as one sentence with the full amount and the date for a screen reader", async () => {
    const props = rowProps({
      reminder: reminder("r1", { title: "Rent", amount: "15000.00", counterparty_name: "Landlord" }),
    });
    const tree = await renderTree(wrap(<ReminderRow {...props} />));
    const label = tree.root.findAll(
      (node) => typeof node.props.accessibilityLabel === "string" && String(node.props.accessibilityLabel).startsWith("Rent, to pay"),
    )[0]?.props.accessibilityLabel as string;
    expect(label).toContain("15,000.00");
    expect(label).toContain("Thursday 5 November 2026");
    unmountTree(tree);
  });
});

describe("ReminderRow (compact, Home)", () => {
  it("is just the tappable row: no buttons", async () => {
    const props = rowProps({ variant: "compact" });
    const tree = await renderTree(wrap(<ReminderRow {...props} />));
    expect(pressables(tree, "Mark paid")).toHaveLength(0);
    expect(pressables(tree, "More actions for Rent")).toHaveLength(0);
    pressText(tree, "Rent");
    expect(props.onPress).toHaveBeenCalledWith(props.reminder);
    unmountTree(tree);
  });
});

function listProps(over: Partial<RemindersListProps> = {}): RemindersListProps {
  return {
    today: TODAY,
    sections: [],
    openCount: 0,
    doneItems: [],
    doneExpanded: false,
    doneLoading: false,
    doneError: false,
    isLoading: false,
    isError: false,
    highlightedId: null,
    busyId: null,
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
    ...over,
  };
}

describe("RemindersList", () => {
  it("teaches and offers Add when there are no reminders", async () => {
    const props = listProps();
    const tree = await renderTree(wrap(<RemindersList {...props} />));
    const texts = textsOf(tree);
    expect(texts).toContain("No reminders yet");
    expect(texts.some((t) => t.startsWith("Add a bill to pay or money to collect"))).toBe(true);
    pressText(tree, "Add reminder");
    expect(props.onAdd).toHaveBeenCalled();
    unmountTree(tree);
  });

  it("shows skeletons while loading, with no Add button or empty message", async () => {
    const tree = await renderTree(wrap(<RemindersList {...listProps({ isLoading: true })} />));
    expect(textsOf(tree)).not.toContain("No reminders yet");
    expect(textsOf(tree)).not.toContain("Done");
    unmountTree(tree);
  });

  it("shows an error with a retry", async () => {
    const props = listProps({ isError: true });
    const tree = await renderTree(wrap(<RemindersList {...props} />));
    expect(textsOf(tree)).toContain("Could not load reminders");
    pressText(tree, "Try again");
    expect(props.onRetry).toHaveBeenCalled();
    unmountTree(tree);
  });

  it("lists each section under its title", async () => {
    const late = reminder("a", { title: "Late fee", due_date: "2026-10-29" });
    const soon = reminder("b", { title: "Phone bill", due_date: "2026-11-02" });
    const props = listProps({
      openCount: 2,
      sections: [
        { id: "overdue", title: "Overdue", items: [late] },
        { id: "dueSoon", title: "Due soon", items: [soon] },
      ],
    });
    const tree = await renderTree(wrap(<RemindersList {...props} />));
    const texts = textsOf(tree);
    expect(texts.indexOf("Overdue")).toBeLessThan(texts.indexOf("Late fee"));
    expect(texts.indexOf("Late fee")).toBeLessThan(texts.indexOf("Due soon"));
    expect(texts.indexOf("Due soon")).toBeLessThan(texts.indexOf("Phone bill"));
    expect(texts).toContain("Done");
    pressText(tree, "Phone bill");
    expect(props.onEdit).toHaveBeenCalledWith(soon);
    unmountTree(tree);
  });

  it("keeps Done collapsed until asked, then shows what is in it", async () => {
    const closed = reminder("c", { title: "Old rent", status: "done", completed_at: "2026-10-01T00:00:00Z" });
    const props = listProps({ openCount: 0, doneExpanded: true, doneItems: [closed] });
    const tree = await renderTree(wrap(<RemindersList {...props} />));
    expect(textsOf(tree)).toContain("Old rent");
    press(tree, "Hide done reminders");
    expect(props.toggleDone).toHaveBeenCalled();
    unmountTree(tree);

    const collapsed = await renderTree(wrap(<RemindersList {...listProps({ doneItems: [closed] })} />));
    expect(textsOf(collapsed)).not.toContain("Old rent");
    press(collapsed, "Show done reminders");
    unmountTree(collapsed);
  });

  it("says so when nothing is done yet or the done list failed", async () => {
    const empty = await renderTree(wrap(<RemindersList {...listProps({ doneExpanded: true })} />));
    expect(textsOf(empty).some((t) => t.startsWith("Nothing done yet"))).toBe(true);
    unmountTree(empty);

    const props = listProps({ doneExpanded: true, doneError: true });
    const failed = await renderTree(wrap(<RemindersList {...props} />));
    expect(textsOf(failed)).toContain("Could not load done reminders.");
    pressText(failed, "Try again");
    expect(props.onRetryDone).toHaveBeenCalled();
    unmountTree(failed);
  });

  describe("scroll to the highlighted reminder (from onLayout, no measureLayout)", () => {
    const scrollTo = ScrollView.prototype.scrollTo as unknown as jest.Mock;
    const a = reminder("a", { title: "Late fee", due_date: "2026-10-29" });
    const b = reminder("b", { title: "Phone bill", due_date: "2026-11-02" });
    const sections = [
      { id: "overdue" as const, title: "Overdue", items: [a] },
      { id: "dueSoon" as const, title: "Due soon", items: [b] },
    ];

    beforeEach(() => {
      scrollTo.mockReset();
    });

    /** The host Views that report their layout, in tree order: sections, then per section: block, card, row, and the Done block last. */
    function layoutViews(tree: TestTree) {
      return tree.root.findAll(
        (node) => node.type === "View" && typeof node.props.onLayout === "function",
      );
    }

    function layout(tree: TestTree, ys: number[]) {
      const views = layoutViews(tree);
      expect(views).toHaveLength(ys.length);
      runAct(() => {
        views.forEach((view, index) => {
          (view.props.onLayout as (e: unknown) => void)({
            nativeEvent: { layout: { x: 0, y: ys[index], width: 300, height: 80 } },
          });
        });
      });
    }

    // sections wrapper, overdue block, its card, row a, due-soon block, its card, row b, Done
    const YS = [10, 0, 30, 0, 200, 30, 100, 500];

    it("scrolls to the sum of the y values along the row's chain, minus a small margin", async () => {
      const tree = await renderTree(
        wrap(<RemindersList {...listProps({ openCount: 2, sections, highlightedId: "b" })} />),
      );
      expect(scrollTo).not.toHaveBeenCalled();
      layout(tree, YS);
      // 10 (sections) + 200 (block) + 30 (card) + 100 (row) - 16
      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollTo).toHaveBeenCalledWith({ y: 324, animated: true });
      unmountTree(tree);
    });

    it("scrolls when the highlight arrives after the layout is known", async () => {
      const base = listProps({ openCount: 2, sections });
      const tree = await renderTree(wrap(<RemindersList {...base} />));
      layout(tree, YS);
      expect(scrollTo).not.toHaveBeenCalled();
      updateTree(tree, wrap(<RemindersList {...base} highlightedId="a" />));
      // 10 + 0 + 30 + 0 - 16
      expect(scrollTo).toHaveBeenCalledWith({ y: 24, animated: true });
      unmountTree(tree);
    });

    it("scrolls once per highlight, never above the top, and again for a new highlight", async () => {
      const base = listProps({ openCount: 2, sections });
      const tree = await renderTree(wrap(<RemindersList {...base} highlightedId="a" />));
      layout(tree, [0, 0, 0, 0, 200, 30, 100, 500]);
      layout(tree, [0, 0, 0, 0, 200, 30, 100, 500]);
      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: true });
      // The tint ends, then the same reminder is pointed at again.
      updateTree(tree, wrap(<RemindersList {...base} highlightedId={null} />));
      updateTree(tree, wrap(<RemindersList {...base} highlightedId="a" />));
      expect(scrollTo).toHaveBeenCalledTimes(2);
      unmountTree(tree);
    });

    it("does nothing for a reminder that is not in the list, and never throws", async () => {
      const tree = await renderTree(
        wrap(<RemindersList {...listProps({ openCount: 2, sections, highlightedId: "gone" })} />),
      );
      layout(tree, YS);
      expect(scrollTo).not.toHaveBeenCalled();
      unmountTree(tree);

      scrollTo.mockImplementation(() => {
        throw new Error("unmounted");
      });
      const again = await renderTree(
        wrap(<RemindersList {...listProps({ openCount: 2, sections, highlightedId: "b" })} />),
      );
      expect(() => layout(again, YS)).not.toThrow();
      unmountTree(again);
    });
  });
});

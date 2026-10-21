import { StackActions } from "@react-navigation/native";

import { navigationRef } from "@/navigation/navigationRef";
import { useAgentChatUiStore } from "@/stores/agentChatUiStore";
import { usePendingDeepLinkStore } from "@/stores/pendingDeepLinkStore";
import { useVoiceCaptureUiStore } from "@/stores/voiceCaptureUiStore";

import { runDeepLinkIntent } from "../runDeepLinkIntent";

jest.mock("@/navigation/navigationRef", () => ({
  navigationRef: { navigate: jest.fn(), dispatch: jest.fn() },
}));

describe("runDeepLinkIntent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePendingDeepLinkStore.setState(usePendingDeepLinkStore.getInitialState(), true);
    useVoiceCaptureUiStore.setState({ visible: false });
    useAgentChatUiStore.setState({ visible: false });
  });

  it("goes to the Home tab", () => {
    runDeepLinkIntent({ kind: "home" });
    expect(navigationRef.navigate).toHaveBeenCalledWith("Main", {
      screen: "MainTabs",
      params: { screen: "Home" },
      pop: true,
    });
  });

  it("pushes a fresh quick-add form with the amount focused and the day preset", () => {
    runDeepLinkIntent({ kind: "add", date: "2026-10-15" });
    expect(navigationRef.dispatch).toHaveBeenCalledWith(
      StackActions.push("ManualAddTransaction", {
        focusAmount: true,
        presetDate: "2026-10-15",
      }),
    );
  });

  it("omits the preset day when the link has none", () => {
    runDeepLinkIntent({ kind: "add" });
    expect(navigationRef.dispatch).toHaveBeenCalledWith(
      StackActions.push("ManualAddTransaction", { focusAmount: true }),
    );
  });

  it("hands the camera flow to the main tabs", () => {
    runDeepLinkIntent({ kind: "scan" });
    expect(usePendingDeepLinkStore.getState().scanRequested).toBe(true);
    expect(navigationRef.navigate).not.toHaveBeenCalled();
  });

  it("opens voice capture and the agent chat", () => {
    runDeepLinkIntent({ kind: "voice" });
    expect(useVoiceCaptureUiStore.getState().visible).toBe(true);
    runDeepLinkIntent({ kind: "agent" });
    expect(useAgentChatUiStore.getState().visible).toBe(true);
    // Back to the tabs that are already there (the chat lives in them), never a second copy.
    expect(navigationRef.navigate).toHaveBeenLastCalledWith("Main", {
      screen: "MainTabs",
      params: { screen: "Home" },
      pop: true,
    });
  });

  it("opens Budgets, scrolling to Recurring for the recurring link", () => {
    runDeepLinkIntent({ kind: "budgets", recurring: false });
    expect(navigationRef.navigate).toHaveBeenLastCalledWith("Main", {
      screen: "MainTabs",
      params: { screen: "Budgets", params: undefined },
      pop: true,
    });
    runDeepLinkIntent({ kind: "budgets", recurring: true });
    expect(navigationRef.navigate).toHaveBeenLastCalledWith("Main", {
      screen: "MainTabs",
      params: { screen: "Budgets", params: { recurringKind: "subscription" } },
      pop: true,
    });
  });
});

describe("usePendingDeepLinkStore", () => {
  it("keeps only the latest link and hands it out once", () => {
    const store = usePendingDeepLinkStore.getState();
    store.enqueue({ kind: "home" });
    store.enqueue({ kind: "agent" });
    expect(usePendingDeepLinkStore.getState().take()).toEqual({ kind: "agent" });
    expect(usePendingDeepLinkStore.getState().take()).toBeNull();
  });
});

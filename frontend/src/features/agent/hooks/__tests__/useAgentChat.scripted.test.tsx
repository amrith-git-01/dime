import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactElement } from "react";

import { streamAgentChat } from "@/features/agent/api/agentApi";
import { useAppTourStore } from "@/features/appTour/store/appTourStore";
import { createTestQueryClient } from "@/test-utils/testQueryClient";

import { SCRIPTED_TOUR_ANSWER_MS, SCRIPTED_TOUR_QUESTION } from "../../utils/scriptedTourChat";
import { useAgentChat } from "../useAgentChat";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("@/features/agent/api/agentApi", () => ({
  // Answers at once, so a real question is not left pending.
  streamAgentChat: jest.fn(
    (_args: unknown, handlers: { onFinal: (response: unknown) => void }) => {
      handlers.onFinal({ answer: "ok", blocks: [], deep_link: null });
      return Promise.resolve();
    },
  ),
  postAgentFeedback: jest.fn(() => Promise.resolve()),
}));
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
jest.mock("@/features/limits/cache/invalidateLimitsQueries", () => ({
  invalidateLimitsQueries: jest.fn(),
}));
jest.mock("@/features/onboarding/cache/invalidateOnboardingProgress", () => ({
  invalidateOnboardingProgress: jest.fn(),
}));

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => Promise<void> | void) => Promise<void>;
  create: (element: ReactElement) => { unmount: () => void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

const mockedStream = streamAgentChat as jest.Mock;
let chat: ReturnType<typeof useAgentChat> | undefined;

function Probe() {
  chat = useAgentChat();
  return null;
}

const current = () => {
  if (!chat) throw new Error("not rendered");
  return chat;
};

describe("Ask AI chat during the tour", () => {
  let client: QueryClient;
  let renderer: { unmount: () => void };

  beforeEach(async () => {
    jest.useFakeTimers();
    mockedStream.mockClear();
    chat = undefined;
    useAppTourStore.setState({ active: false, tourId: "firstExpense", stepIndex: 0, completion: null });
    client = createTestQueryClient();
    await act(async () => {
      renderer = create(createElement(QueryClientProvider, { client }, createElement(Probe)));
    });
  });

  afterEach(async () => {
    await act(async () => {
      renderer.unmount();
    });
    client.clear();
    jest.useRealTimers();
  });

  it("outside a tour a question goes to the model", async () => {
    await act(async () => {
      await current().sendMessage("hello");
    });
    expect(mockedStream).toHaveBeenCalledTimes(1);
  });

  it("during the Ask AI tour a question is answered by a script and never reaches the model", async () => {
    await act(async () => {
      useAppTourStore.getState().start("askAi");
    });
    await act(async () => {
      await current().sendMessage(SCRIPTED_TOUR_QUESTION);
    });
    expect(mockedStream).not.toHaveBeenCalled();
    expect(current().isPending).toBe(true);
    expect(current().messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(current().messages[1].isPending).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(SCRIPTED_TOUR_ANSWER_MS + 50);
    });
    expect(mockedStream).not.toHaveBeenCalled();
    expect(current().isPending).toBe(false);
    const answer = current().messages[1];
    expect(answer.isPending).toBe(false);
    expect(answer.content).toContain("7,076");
    expect(answer.blocks).toHaveLength(1);
    expect(answer.blocks[0]).toMatchObject({ type: "mini_chart", chart_kind: "donut" });
    // No server turn: nothing to give feedback on, and nothing was counted.
    expect(answer.turnId).toBeNull();
  });

  it("does not run the script for another tour", async () => {
    await act(async () => {
      useAppTourStore.getState().start("home");
    });
    await act(async () => {
      await current().sendMessage("hello");
    });
    expect(mockedStream).toHaveBeenCalledTimes(1);
  });

  it("starts the tour from a clean chat and puts the user's own conversation back afterwards", async () => {
    await act(async () => {
      await current().sendMessage("real question");
    });
    expect(current().messages.some((message) => message.content === "real question")).toBe(true);

    await act(async () => {
      useAppTourStore.getState().start("askAi");
    });
    expect(current().messages).toEqual([]);

    await act(async () => {
      await current().sendMessage(SCRIPTED_TOUR_QUESTION);
    });
    await act(async () => {
      jest.advanceTimersByTime(SCRIPTED_TOUR_ANSWER_MS + 50);
    });
    expect(current().messages).toHaveLength(2);

    await act(async () => {
      useAppTourStore.getState().skip();
    });
    expect(current().messages.some((message) => message.content === "real question")).toBe(true);
    expect(current().messages.some((message) => message.content === SCRIPTED_TOUR_QUESTION)).toBe(false);
    expect(current().isPending).toBe(false);
  });

  it("ending the tour mid-answer drops the scripted reply instead of landing it later", async () => {
    await act(async () => {
      useAppTourStore.getState().start("askAi");
    });
    await act(async () => {
      await current().sendMessage(SCRIPTED_TOUR_QUESTION);
    });
    await act(async () => {
      useAppTourStore.getState().skip();
    });
    await act(async () => {
      jest.advanceTimersByTime(SCRIPTED_TOUR_ANSWER_MS + 50);
    });
    expect(current().messages).toEqual([]);
    expect(current().isPending).toBe(false);
  });

  it("never aborts a real question that is still being answered: the tour's chat waits for the turn to end", async () => {
    let finish: (() => void) | undefined;
    let signal: AbortSignal | undefined;
    mockedStream.mockImplementationOnce(
      (
        args: { signal: AbortSignal },
        handlers: { onFinal: (response: unknown) => void },
      ) =>
        new Promise<void>((resolve) => {
          signal = args.signal;
          finish = () => {
            handlers.onFinal({ answer: "real answer", blocks: [], deep_link: null });
            resolve();
          };
        }),
    );
    await act(async () => {
      void current().sendMessage("real question");
    });
    expect(current().isPending).toBe(true);

    await act(async () => {
      useAppTourStore.getState().start("askAi");
    });
    // The real turn is still going: not aborted, and the chat has not been swapped yet.
    expect(signal?.aborted).toBe(false);
    expect(current().messages.some((message) => message.content === "real question")).toBe(true);

    await act(async () => {
      finish?.();
    });
    // Now it is done, the tour's chat starts clean.
    expect(current().messages).toEqual([]);

    await act(async () => {
      useAppTourStore.getState().skip();
    });
    expect(current().messages.some((message) => message.content === "real answer")).toBe(true);
  });
});

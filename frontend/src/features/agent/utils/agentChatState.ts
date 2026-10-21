import type {
  AgentChatHistoryMessage,
  AgentChatResponse,
  AgentFeedbackRating,
  ChatMessage,
} from "../types";

export type AgentChatState = {
  messages: ChatMessage[];
  /** Signed memory token from the last `final`; sent back on the next turn. */
  memory: string | null;
  /** Request whose events may still change state; `null` when idle. */
  activeRequestId: number | null;
  /** The placeholder assistant message of the active request. */
  activeAssistantId: string | null;
};

export type AgentChatAction =
  | {
      type: "send";
      requestId: number;
      userMessage: ChatMessage;
      assistantMessage: ChatMessage;
    }
  | { type: "step"; requestId: number; label: string }
  | { type: "delta"; requestId: number; text: string }
  | { type: "final"; requestId: number; response: AgentChatResponse }
  | { type: "error"; requestId: number; message: string }
  /** Request cancelled by the user: drop the placeholder. */
  | { type: "abort"; requestId: number }
  | { type: "reset" }
  /** Puts a stashed conversation back (the guided tour's sample chat ended). */
  | { type: "restore"; state: AgentChatState }
  | { type: "feedback"; messageId: string; rating: AgentFeedbackRating }
  | { type: "feedbackFailed"; messageId: string };

export const initialAgentChatState: AgentChatState = {
  messages: [],
  memory: null,
  activeRequestId: null,
  activeAssistantId: null,
};

const HISTORY_USER_TURNS = 3;
const HISTORY_TURN_MAX_CHARS = 500;

/**
 * History per contract C9: the server only reads user turns (assistant text is
 * never put in prompts), so send the last few, truncated, to keep the payload small.
 */
export function buildAgentHistory(
  messages: ChatMessage[],
): AgentChatHistoryMessage[] {
  return messages
    .filter(
      (msg) =>
        msg.role === "user" && !msg.isError && msg.content.trim().length > 0,
    )
    .slice(-HISTORY_USER_TURNS)
    .map((msg) => ({
      role: "user",
      content: msg.content.trim().slice(0, HISTORY_TURN_MAX_CHARS),
    }));
}

function patchActiveAssistant(
  state: AgentChatState,
  patch: (msg: ChatMessage) => ChatMessage,
): AgentChatState {
  return {
    ...state,
    messages: state.messages.map((msg) =>
      msg.id === state.activeAssistantId ? patch(msg) : msg,
    ),
  };
}

const IDLE = { activeRequestId: null, activeAssistantId: null } as const;

export function agentChatReducer(
  state: AgentChatState,
  action: AgentChatAction,
): AgentChatState {
  switch (action.type) {
    case "send":
      return {
        ...state,
        messages: [
          ...state.messages,
          action.userMessage,
          action.assistantMessage,
        ],
        activeRequestId: action.requestId,
        activeAssistantId: action.assistantMessage.id,
      };
    case "reset":
      // Memory belongs to the conversation: a new conversation starts fresh.
      return initialAgentChatState;
    case "restore":
      return action.state;
    case "feedback":
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === action.messageId && !msg.feedback && msg.turnId
            ? { ...msg, feedback: action.rating }
            : msg,
        ),
      };
    case "feedbackFailed":
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === action.messageId ? { ...msg, feedback: null } : msg,
        ),
      };
  }

  // Remaining actions belong to a request: ignore anything from a stale one.
  if (action.requestId !== state.activeRequestId) {
    return state;
  }

  switch (action.type) {
    case "step":
      return patchActiveAssistant(state, (msg) => ({
        ...msg,
        stepLabel: action.label,
      }));
    case "delta":
      return patchActiveAssistant(state, (msg) => ({
        ...msg,
        content: msg.content + action.text,
      }));
    case "final": {
      const { response } = action;
      return {
        ...patchActiveAssistant(state, (msg) => ({
          ...msg,
          // `final.answer` is authoritative: it replaces whatever was streamed.
          content: response.answer,
          blocks: response.blocks,
          deepLink: response.deep_link,
          turnId: response.turn_id ?? null,
          stepLabel: null,
          isPending: false,
        })),
        memory: response.memory ?? state.memory,
        ...IDLE,
      };
    }
    case "error":
      return {
        ...patchActiveAssistant(state, (msg) => ({
          ...msg,
          content: action.message,
          blocks: [],
          deepLink: null,
          stepLabel: null,
          isPending: false,
          isError: true,
        })),
        ...IDLE,
      };
    case "abort":
      return {
        ...state,
        messages: state.messages.filter(
          (msg) => msg.id !== state.activeAssistantId,
        ),
        ...IDLE,
      };
  }
}

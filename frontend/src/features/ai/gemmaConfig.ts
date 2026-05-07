import type { LLMConfig } from "react-native-litert-lm";

export type GemmaModelConfig = {
  modelUrl: string;
  llmConfig: LLMConfig;
};

export const DEFAULT_GEMMA_CONFIG: GemmaModelConfig = {
  modelUrl:
    "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm",
  llmConfig: {
    backend: "cpu",
    systemPrompt:
      "You are Dime's friendly on-device finance assistant. " +
      "Be warm, clear, and concise. " +
      "For normal chat, respond naturally in 1-3 short lines. " +
      "For finance tasks (merchant cleanup, categorization, receipt parsing), " +
      "return exactly what is requested with no extra fluff.",
    maxTokens: 1024,
  },
};

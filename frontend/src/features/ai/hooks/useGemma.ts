import { useCallback, useMemo, useState } from "react";
import { useModel } from "react-native-litert-lm";

import { DEFAULT_GEMMA_CONFIG } from "../gemmaConfig";
import { buildCategorizePrompt } from "../prompts/categorize";
import { buildCleanMerchantPrompt } from "../prompts/cleanMerchant";

export type GemmaHookStatus =
  | "idle"
  | "checking"
  | "needs_download"
  | "downloading"
  | "needs_init"
  | "initializing"
  | "ready"
  | "error";

export type UseGemmaResult = {
  status: GemmaHookStatus;
  downloadProgress: number;
  error: string | null;
  startDownload: () => Promise<void>;
  retryAfterError: () => Promise<void>;
  categorize: (
    merchant: string,
    amount: string | number,
  ) => Promise<string | null>;
  cleanMerchant: (rawSmsText: string) => Promise<string | null>;
  promptRaw: (text: string) => Promise<string | null>;
  promptWithImage: (imagePath: string, text: string) => Promise<string | null>;
};

export function useGemma(): UseGemmaResult {
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const {
    model,
    isReady,
    downloadProgress,
    error: modelError,
    load,
  } = useModel(DEFAULT_GEMMA_CONFIG.modelUrl, {
    ...DEFAULT_GEMMA_CONFIG.llmConfig,
    autoLoad: false,
  });

  const status: GemmaHookStatus = useMemo(() => {
    if (isReady) {
      return "ready";
    }
    if (runtimeError || modelError) {
      return "error";
    }
    if (isLoadingModel) {
      return downloadProgress > 0 ? "downloading" : "initializing";
    }
    return "needs_download";
  }, [downloadProgress, isLoadingModel, isReady, modelError, runtimeError]);

  const startDownload = useCallback(async () => {
    setRuntimeError(null);
    setIsLoadingModel(true);
    try {
      await load();
    } catch (e) {
      setRuntimeError(e instanceof Error ? e.message : "Model download failed");
    } finally {
      setIsLoadingModel(false);
    }
  }, [load]);

  const retryAfterError = useCallback(async () => {
    await startDownload();
  }, [startDownload]);

  const promptRaw = useCallback(
    async (text: string) => {
      if (!isReady || !model) {
        return null;
      }
      try {
        const out = await model.sendMessage(text);
        const trimmed = out.trim();
        return trimmed.length > 0 ? trimmed : null;
      } catch (e) {
        setRuntimeError(e instanceof Error ? e.message : "Prompt failed");
        return null;
      }
    },
    [isReady, model],
  );

  const promptWithImage = useCallback(
    async (imagePath: string, text: string) => {
      if (!isReady || !model) {
        return null;
      }
      try {
        const out = await model.sendMessageWithImage(text, imagePath);
        const trimmed = out.trim();
        return trimmed.length > 0 ? trimmed : null;
      } catch (e) {
        setRuntimeError(e instanceof Error ? e.message : "Image prompt failed");
        return null;
      }
    },
    [isReady, model],
  );

  const categorize = useCallback(
    async (merchant: string, amount: string | number) => {
      const prompt = buildCategorizePrompt(merchant, String(amount));
      return promptRaw(prompt);
    },
    [promptRaw],
  );

  const cleanMerchant = useCallback(
    async (rawSmsText: string) => {
      const prompt = buildCleanMerchantPrompt(rawSmsText);
      return promptRaw(prompt);
    },
    [promptRaw],
  );

  return {
    status,
    downloadProgress: Math.max(
      0,
      Math.min(100, Math.round(downloadProgress * 100)),
    ),
    error: runtimeError ?? modelError,
    startDownload,
    retryAfterError,
    categorize,
    cleanMerchant,
    promptRaw,
    promptWithImage,
  };
}

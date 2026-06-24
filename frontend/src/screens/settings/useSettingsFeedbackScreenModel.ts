import { useCallback, useMemo, useState } from "react";
import { Keyboard } from "react-native";

import { useSubmitFeedbackMutation } from "@/features/settings/hooks/useSubmitFeedbackMutation";
import type { FeedbackType } from "@/features/settings/types";
import { useToast } from "@/features/toast/useToast";
import { parseFastApiError } from "@/lib/api/parseFastApiError";

const DEFAULT_TYPE: FeedbackType = "bug";

export function useSettingsFeedbackScreenModel() {
  const { showToast } = useToast();
  const submitMutation = useSubmitFeedbackMutation();
  const [feedbackType, setFeedbackType] = useState<FeedbackType>(DEFAULT_TYPE);
  const [message, setMessage] = useState("");

  const sendDisabled = useMemo(() => message.trim().length < 8, [message]);

  const handleClear = useCallback(() => {
    Keyboard.dismiss();
    setMessage("");
    setFeedbackType(DEFAULT_TYPE);
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (trimmed.length < 8) {
      return;
    }

    Keyboard.dismiss();

    void submitMutation
      .mutateAsync({ type: feedbackType, message: trimmed })
      .then(() => {
        showToast({ variant: "success", message: "Thanks for your feedback." });
        setMessage("");
        setFeedbackType(DEFAULT_TYPE);
      })
      .catch((error: unknown) => {
        showToast({
          variant: "error",
          message: parseFastApiError(error) || "Could not send feedback.",
        });
      });
  }, [feedbackType, message, showToast, submitMutation]);

  return {
    feedbackType,
    setFeedbackType,
    message,
    setMessage,
    sendDisabled,
    sendLoading: submitMutation.isPending,
    onClear: handleClear,
    onSend: handleSend,
  };
}

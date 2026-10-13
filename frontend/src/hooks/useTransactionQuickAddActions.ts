import { useCallback } from "react";

import { useReceiptCameraTransaction } from "@/features/transactions/hooks/useReceiptCameraTransaction";
import type { MainStackParamList } from "@/navigation/types";
import { useVoiceCaptureUiStore } from "@/stores/voiceCaptureUiStore";

type TransactionQuickAddNavigation = {
  navigate: <RouteName extends keyof MainStackParamList>(
    ...args: undefined extends MainStackParamList[RouteName]
      ? [screen: RouteName] | [screen: RouteName, params: MainStackParamList[RouteName]]
      : [screen: RouteName, params: MainStackParamList[RouteName]]
  ) => void;
  push: (
    screen: "ManualAddTransaction",
    params: MainStackParamList["ManualAddTransaction"],
  ) => void;
};

export function useTransactionQuickAddActions(
  navigation: TransactionQuickAddNavigation,
) {
  const captureReceiptAndCreate = useReceiptCameraTransaction();
  const openVoiceCapture = useVoiceCaptureUiStore((s) => s.open);

  const onManualAdd = useCallback(() => {
    navigation.navigate("ManualAddTransaction");
  }, [navigation]);

  // `push` (not `navigate`) so a fresh form instance gets the day, even when one is already open.
  const onManualAddForDay = useCallback(
    (dayKey: string) => {
      navigation.push("ManualAddTransaction", { presetDate: dayKey });
    },
    [navigation],
  );

  const onReceipt = useCallback(() => {
    void captureReceiptAndCreate();
  }, [captureReceiptAndCreate]);

  const onVoice = useCallback(() => {
    openVoiceCapture();
  }, [openVoiceCapture]);

  return {
    onManualAdd,
    onManualAddForDay,
    onReceipt,
    onVoice,
  };
}

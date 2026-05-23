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
};

export function useTransactionQuickAddActions(
  navigation: TransactionQuickAddNavigation,
) {
  const captureReceiptAndCreate = useReceiptCameraTransaction();
  const openVoiceCapture = useVoiceCaptureUiStore((s) => s.open);

  const onManualAdd = useCallback(() => {
    navigation.navigate("ManualAddTransaction");
  }, [navigation]);

  const onReceipt = useCallback(() => {
    void captureReceiptAndCreate();
  }, [captureReceiptAndCreate]);

  const onVoice = useCallback(() => {
    openVoiceCapture();
  }, [openVoiceCapture]);

  return {
    onManualAdd,
    onReceipt,
    onVoice,
  };
}

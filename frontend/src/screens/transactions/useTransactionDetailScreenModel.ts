import {
  useNavigation,
  useRoute,
  type RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";

import { useToast } from "@/features/toast/useToast";
import { isTourSampleId } from "@/features/tourPreview";
import { useTransactionDetailQuery } from "@/features/transactions/hooks/useTransactionDetailQuery";
import { useDeleteTransactionMutation } from "@/features/transactions/hooks/useDeleteTransactionMutation";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { isFastApiNotFound } from "@/lib/api/parseFastApiError";
import type { MainStackParamList } from "@/navigation/types";

type DetailRoute = RouteProp<MainStackParamList, "TransactionDetail">;

export function useTransactionDetailScreenModel() {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { params } = useRoute<DetailRoute>();
  // Route param seeds the cache; the query refetches on open so signed media URLs are fresh (C7).
  const { data: transaction = params.transaction } = useTransactionDetailQuery(
    params.transaction,
  );
  const { showToast } = useToast();
  const deleteMutation = useDeleteTransactionMutation();
  const [confirmVisible, setConfirmVisible] = useState(false);
  // A row from the guided tour's sample data: shown, never edited or deleted.
  const isSample = isTourSampleId(transaction.id);

  const handleDismiss = useCallback(() => {
    void triggerHaptic();
    navigation.goBack();
  }, [navigation]);

  const handleEdit = useCallback(() => {
    if (isSample) {
      return;
    }
    void triggerHaptic();
    navigation.replace("EditTransaction", { transaction });
  }, [isSample, navigation, transaction]);

  const handleDeletePress = useCallback(() => {
    if (isSample) {
      return;
    }
    void triggerHaptic();
    setConfirmVisible(true);
  }, [isSample]);

  const handleCancelDelete = useCallback(() => {
    setConfirmVisible(false);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (isSample) {
      setConfirmVisible(false);
      return;
    }
    void deleteMutation
      .mutateAsync(transaction.id)
      .then(() => {
        setConfirmVisible(false);
        showToast({ variant: "success", message: "Transaction deleted" });
        navigation.goBack();
      })
      .catch((error: unknown) => {
        if (
          isFastApiNotFound(error) ||
          (error instanceof Error && /not found/i.test(error.message))
        ) {
          setConfirmVisible(false);
          showToast({ variant: "success", message: "Transaction deleted" });
          navigation.goBack();
          return;
        }
        showToast({
          variant: "error",
          message: "Could not delete transaction",
        });
      });
  }, [deleteMutation, isSample, navigation, showToast, transaction.id]);

  return {
    transaction,
    isSample,
    confirmVisible,
    deleteLoading: deleteMutation.isPending,
    handleDismiss,
    handleEdit,
    handleDeletePress,
    handleCancelDelete,
    handleConfirmDelete,
  };
}


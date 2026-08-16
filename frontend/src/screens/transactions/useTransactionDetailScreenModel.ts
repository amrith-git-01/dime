import {
  useNavigation,
  useRoute,
  type RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";

import { useToast } from "@/features/toast/useToast";
import { useDeleteTransactionMutation } from "@/features/transactions/hooks/useDeleteTransactionMutation";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { isFastApiNotFound } from "@/lib/api/parseFastApiError";
import type { MainStackParamList } from "@/navigation/types";

type DetailRoute = RouteProp<MainStackParamList, "TransactionDetail">;

export function useTransactionDetailScreenModel() {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { params } = useRoute<DetailRoute>();
  const { transaction } = params;
  const { showToast } = useToast();
  const deleteMutation = useDeleteTransactionMutation();
  const [confirmVisible, setConfirmVisible] = useState(false);

  const handleDismiss = useCallback(() => {
    void triggerHaptic();
    navigation.goBack();
  }, [navigation]);

  const handleEdit = useCallback(() => {
    void triggerHaptic();
    navigation.replace("EditTransaction", { transaction });
  }, [navigation, transaction]);

  const handleDeletePress = useCallback(() => {
    void triggerHaptic();
    setConfirmVisible(true);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setConfirmVisible(false);
  }, []);

  const handleConfirmDelete = useCallback(() => {
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
  }, [deleteMutation, navigation, showToast, transaction.id]);

  return {
    transaction,
    confirmVisible,
    deleteLoading: deleteMutation.isPending,
    handleDismiss,
    handleEdit,
    handleDeletePress,
    handleCancelDelete,
    handleConfirmDelete,
  };
}


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
import { useRestoreTransactionMutation } from "@/features/transactions/hooks/useRestoreTransactionMutation";
import { useStaleTransactionHandler } from "@/features/transactions/hooks/useStaleTransactionHandler";
import { useUpdateTransactionMutation } from "@/features/transactions/hooks/useUpdateTransactionMutation";
import { isTransactionStaleError } from "@/features/transactions/utils/staleError";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { isFastApiNotFound } from "@/lib/api/parseFastApiError";
import type { MainStackParamList } from "@/navigation/types";

type DetailRoute = RouteProp<MainStackParamList, "TransactionDetail">;

/** How long the Undo of a delete stays on screen. */
const UNDO_TOAST_MS = 5_000;

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
  const restoreMutation = useRestoreTransactionMutation();
  const updateMutation = useUpdateTransactionMutation();
  const handleStale = useStaleTransactionHandler();
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
    const id = transaction.id;
    void deleteMutation
      .mutateAsync({ id, expectedUpdatedAt: transaction.updated_at, row: transaction })
      .then((result) => {
        setConfirmVisible(false);
        // Undo for five seconds: the row comes back with its paybacks and the budget it counted toward.
        showToast({
          variant: "success",
          message: "Transaction deleted",
          durationMs: UNDO_TOAST_MS,
          action: {
            label: "Undo",
            onPress: () => {
              restoreMutation
                .mutateAsync({
                  id,
                  ...(result.status === "queued" ? { queuedDeleteOutboxId: result.outboxId } : {}),
                })
                .then(() => showToast({ variant: "success", message: "Transaction restored" }))
                .catch(() => showToast({ variant: "error", message: "Could not restore it." }));
            },
          },
        });
        navigation.goBack();
      })
      .catch((error: unknown) => {
        if (isTransactionStaleError(error)) {
          // Changed on another device: the open card refetches to show what is there now.
          setConfirmVisible(false);
          handleStale();
          return;
        }
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
  }, [deleteMutation, handleStale, isSample, navigation, restoreMutation, showToast, transaction]);

  // "Needs review": the user looked at it and it is right. An empty edit settles it on the server.
  const handleMarkReviewed = useCallback(() => {
    if (isSample) {
      return;
    }
    void updateMutation
      .mutateAsync({
        id: transaction.id,
        body: { expected_updated_at: transaction.updated_at },
        original: transaction,
      })
      .then(() => showToast({ variant: "success", message: "Marked as checked" }))
      .catch((error: unknown) => {
        if (isTransactionStaleError(error)) {
          handleStale();
          return;
        }
        showToast({ variant: "error", message: "Could not update it." });
      });
  }, [handleStale, isSample, showToast, transaction, updateMutation]);

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
    handleMarkReviewed,
    markReviewedLoading: updateMutation.isPending,
    openPaidBack: params.openPaidBack === true,
  };
}


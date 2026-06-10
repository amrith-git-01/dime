import { useCallback, useEffect, useMemo, useState } from "react";

import { TwoToneConfirmModal } from "@/components/shared";
import { SelectDropdown } from "@/components/ui";
import { useCategoryDeleteImpactQuery } from "@/features/categories/hooks/useCategoryDeleteImpactQuery";
import type { CategoryRow } from "@/features/categories/types";

type DeleteCategorySheetProps = {
  visible: boolean;
  category: CategoryRow;
  categories: readonly CategoryRow[];
  onClose: () => void;
  onConfirmDelete: (reassignToCategoryId?: string) => void;
  deleteLoading?: boolean;
};

export function DeleteCategorySheet({
  visible,
  category,
  categories,
  onClose,
  onConfirmDelete,
  deleteLoading = false,
}: DeleteCategorySheetProps) {
  const [moveToCategoryId, setMoveToCategoryId] = useState("");

  const {
    data: impact,
    isPending,
    isError,
    isFetching,
  } = useCategoryDeleteImpactQuery(category.id, { enabled: visible });

  const transactionCount = impact?.transaction_count;
  const impactLoading =
    visible && (isPending || (isFetching && impact == null));

  const moveToOptions = useMemo(
    () =>
      categories
        .filter((row) => row.id !== category.id)
        .map((row) => ({ value: row.id, label: row.name })),
    [categories, category.id],
  );

  const needsReassign =
    transactionCount != null &&
    transactionCount > 0 &&
    moveToOptions.length > 0;

  const confirmDisabled =
    deleteLoading ||
    impactLoading ||
    isError ||
    transactionCount == null ||
    (needsReassign && !moveToCategoryId);

  useEffect(() => {
    if (visible) {
      setMoveToCategoryId("");
    }
  }, [visible, category.id]);

  const handleConfirm = useCallback(() => {
    if (transactionCount == null || isError) {
      return;
    }
    if (transactionCount > 0 && moveToOptions.length > 0) {
      if (!moveToCategoryId) {
        return;
      }
      onConfirmDelete(moveToCategoryId);
      return;
    }
    onConfirmDelete();
  }, [
    isError,
    moveToCategoryId,
    moveToOptions.length,
    onConfirmDelete,
    transactionCount,
  ]);

  const message = useMemo(() => {
    if (impactLoading || transactionCount == null) {
      return null;
    }
    if (transactionCount === 0) {
      return "This cannot be undone.";
    }
    const noun = transactionCount === 1 ? "transaction" : "transactions";
    return `${transactionCount} ${noun} use this category. Choose where to move them, then delete.`;
  }, [impactLoading, transactionCount]);

  const extraBody = needsReassign ? (
    <SelectDropdown
      label="Move to"
      options={moveToOptions}
      value={moveToCategoryId}
      onChange={setMoveToCategoryId}
      placeholder="Select category"
      menuPlacement="modal"
      menuOpenDirection="below"
      size="compact"
    />
  ) : null;

  const errorMessage =
    isError && !impactLoading
      ? "Could not load transaction count. Try again."
      : transactionCount != null &&
          transactionCount > 0 &&
          moveToOptions.length === 0 &&
          !impactLoading
        ? "Add another category before deleting this one."
        : null;

  return (
    <TwoToneConfirmModal
      visible={visible}
      title={`Delete ${category.name}?`}
      message={errorMessage ? null : message}
      cancelLabel="Cancel"
      confirmLabel="Delete"
      confirmTone="danger"
      onCancel={onClose}
      onConfirm={handleConfirm}
      confirmLoading={deleteLoading}
      confirmDisabled={confirmDisabled}
      loading={impactLoading}
      errorMessage={errorMessage}
    >
      {extraBody}
    </TwoToneConfirmModal>
  );
}

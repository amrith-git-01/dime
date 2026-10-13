import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";

import { CategoryPill } from "@/components/categories/CategoryPill";
import { ConfirmModal } from "@/components/shared";
import { spacing } from "@/constants";
import { useCategoryDeleteImpactQuery } from "@/features/categories/hooks/useCategoryDeleteImpactQuery";
import type { CategoryRow } from "@/features/categories/types";
import { createThemedStyles } from "@/theme";

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
  const styles = useStyles();
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

  const reassignCategories = useMemo(
    () => categories.filter((row) => row.id !== category.id),
    [categories, category.id],
  );

  const needsReassign =
    transactionCount != null &&
    transactionCount > 0 &&
    reassignCategories.length > 0;

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
    if (transactionCount > 0 && reassignCategories.length > 0) {
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
    onConfirmDelete,
    reassignCategories.length,
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

  const reassignPicker = needsReassign ? (
    <View style={styles.reassignSection}>
      <Text style={styles.reassignLabel}>MOVE TO</Text>
      <View style={styles.categoryGrid}>
        {reassignCategories.map((row) => (
          <CategoryPill
            key={row.id}
            label={row.name}
            iconName={row.icon_name}
            iconColor={row.color}
            selected={moveToCategoryId === row.id}
            onPress={() =>
              setMoveToCategoryId((current) =>
                current === row.id ? "" : row.id,
              )
            }
          />
        ))}
      </View>
    </View>
  ) : null;

  const errorMessage =
    isError && !impactLoading
      ? "Could not load transaction count. Try again."
      : transactionCount != null &&
          transactionCount > 0 &&
          reassignCategories.length === 0 &&
          !impactLoading
        ? "Add another category before deleting this one."
        : null;

  return (
    <ConfirmModal
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
      {reassignPicker}
    </ConfirmModal>
  );
}

const useStyles = createThemedStyles(({ colors, typography }) => ({
  reassignSection: {
    gap: spacing.sm,
  },
  reassignLabel: {
    ...typography.eyebrow,
    color: colors.accentText,
    textAlign: "left",
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
}));

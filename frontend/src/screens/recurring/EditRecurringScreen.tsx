import { ActivityIndicator, StyleSheet, View } from "react-native";

import { ConfirmModal } from "@/components/shared";
import { colors, spacing } from "@/constants";
import { RecurringEditor } from "@/features/recurring/components";

import { useEditRecurringScreenModel } from "./useEditRecurringScreenModel";

export default function EditRecurringScreen() {
  const model = useEditRecurringScreenModel();

  if (!model.editorProps) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <RecurringEditor {...model.editorProps} />
      <ConfirmModal
        {...model.deleteConfirmModalProps}
        cancelLabel="Cancel"
        confirmLabel="Delete"
        confirmTone="danger"
      />
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: spacing.xl,
    alignItems: "center",
  },
});

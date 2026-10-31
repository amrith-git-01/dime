import { StyleSheet, View } from "react-native";

import { ConfirmModal } from "@/components/shared";
import { RemindersList } from "@/features/reminders/components";

import { useRemindersScreenModel } from "./useRemindersScreenModel";

/** The Reminders list: bills to pay and money to collect, with every action of a row. */
export default function RemindersScreen() {
  const model = useRemindersScreenModel();
  const target = model.pendingDelete;

  return (
    <View style={styles.root}>
      <RemindersList {...model} />
      <ConfirmModal
        visible={target !== null}
        title="Delete this reminder?"
        message={
          target
            ? `"${target.title}" stops reminding you. Transactions you have added stay in your history.`
            : null
        }
        confirmLabel="Delete"
        confirmBusyLabel="Deleting"
        confirmTone="danger"
        confirmLoading={model.deleting}
        onCancel={model.onDeleteCancel}
        onConfirm={model.onDeleteConfirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

import { StyleSheet, View } from "react-native";

import { ConfirmModal } from "@/components/shared";
import { TextField } from "@/components/ui";
import { RemindersList } from "@/features/reminders/components";

import { useRemindersScreenModel } from "./useRemindersScreenModel";

/** The Reminders list: bills to pay and money to collect, with every action of a row. */
export default function RemindersScreen() {
  const model = useRemindersScreenModel();
  const target = model.pendingDelete;
  const part = model.partPayment;

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
      <ConfirmModal
        visible={part !== null}
        title="Part payment"
        message={part ? model.partPaymentPrompt : null}
        confirmLabel="Record"
        confirmBusyLabel="Recording"
        onCancel={model.onPartPaymentCancel}
        onConfirm={model.onPartPaymentConfirm}
      >
        <TextField
          label="Amount paid"
          value={model.partPaymentText}
          onChangeText={model.onPartPaymentTextChange}
          keyboardType="decimal-pad"
          placeholder="0.00"
          errorMessage={model.partPaymentError}
        />
      </ConfirmModal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

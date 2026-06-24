import { memo, useCallback } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { BentoEditorFooter } from "@/components/bento";
import { BentoSectionCard } from "@/components/shared";
import { TextField } from "@/components/ui";
import { ink, inkSoft, layout, line, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { useSmsInboxReviewScreenModel } from "@/screens/transactions/useSmsInboxReviewScreenModel";

function SmsInboxReviewScreen() {
  const model = useSmsInboxReviewScreenModel();

  const onEdit = useCallback(
    (id: string) => {
      model.setEditingId((current) => (current === id ? null : id));
    },
    [model],
  );

  if (model.phase === "scanning" || model.phase === "idle") {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Looking for bank messages…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.lead}>
          Review these messages. Delete junk, edit text if needed, then Sync to
          log them.
        </Text>
        <BentoSectionCard>
          {model.remaining.map((row, index) => {
            const isLast = index === model.remaining.length - 1;
            const editing = model.editingId === row.id;
            return (
              <View
                key={row.id}
                style={[styles.row, !isLast && styles.rowDivider]}
              >
                <Text style={styles.sender} numberOfLines={1}>
                  {row.address || "Unknown sender"}
                </Text>
                <Text style={styles.stamp}>
                  {model.formatStamp(row.dateMs)}
                </Text>
                {editing ? (
                  <TextField
                    label="Message"
                    hideLabel
                    value={row.body}
                    onChangeText={(text) => model.updateBody(row.id, text)}
                    multiline
                  />
                ) : (
                  <Text style={styles.body}>{row.body}</Text>
                )}
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => onEdit(row.id)}
                    accessibilityRole="button"
                    accessibilityLabel="Edit message"
                  >
                    <Text style={styles.actionText}>
                      {editing ? "Done" : "Edit"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => model.deleteRow(row.id)}
                    accessibilityRole="button"
                    accessibilityLabel="Delete message"
                  >
                    <Text style={styles.actionText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
          {model.remaining.length === 0 ? (
            <Text style={styles.empty}>
              All messages removed. Sync to skip them next time.
            </Text>
          ) : null}
        </BentoSectionCard>
      </ScrollView>
      <BentoEditorFooter
        clearTitle="Cancel"
        saveTitle="Sync"
        onClear={model.onCancel}
        onSave={() => {
          void model.onSync();
        }}
        saveLoading={model.syncing}
      />
    </View>
  );
}

export default memo(SmsInboxReviewScreen);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: layout.screenContent.paddingHorizontal,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  loadingText: {
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    color: inkSoft,
  },
  lead: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 22,
    color: inkSoft,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  row: {
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: line,
  },
  sender: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    color: ink,
  },
  stamp: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: inkSoft,
  },
  body: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: ink,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.lg,
    paddingTop: spacing.xs,
  },
  actionText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    color: ink,
  },
  empty: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    color: inkSoft,
    paddingVertical: spacing.md,
  },
});

import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { BentoEditorFooter } from "@/components/bento";
import {
  BentoSectionCard,
  BentoSectionCardSegment,
  CARD_SEGMENT_SHADOW_TOP_BLEED,
} from "@/components/shared";
import { TextField } from "@/components/ui";
import { ink, inkSoft, layout, line, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import type { InboxSms } from "@/features/transactions/sms/smsTypes";
import { useSmsInboxReviewScreenModel } from "@/screens/transactions/useSmsInboxReviewScreenModel";

type SmsRowProps = {
  row: InboxSms;
  isFirst: boolean;
  isLast: boolean;
  editing: boolean;
  stamp: string;
  onToggleEdit: (id: string) => void;
  onChangeBody: (id: string, body: string) => void;
  onDelete: (id: string) => void;
};

const SmsRow = memo(function SmsRow({
  row,
  isFirst,
  isLast,
  editing,
  stamp,
  onToggleEdit,
  onChangeBody,
  onDelete,
}: SmsRowProps) {
  return (
    <BentoSectionCardSegment isFirst={isFirst} isLast={isLast}>
      <View style={[styles.row, !isLast && styles.rowDivider]}>
        <Text style={styles.sender} numberOfLines={1}>
          {row.address || "Unknown sender"}
        </Text>
        <Text style={styles.stamp}>{stamp}</Text>
        {editing ? (
          <TextField
            label="Message"
            hideLabel
            value={row.body}
            onChangeText={(text) => onChangeBody(row.id, text)}
            multiline
          />
        ) : (
          <Text style={styles.body}>{row.body}</Text>
        )}
        <View style={styles.actions}>
          <Pressable
            onPress={() => onToggleEdit(row.id)}
            accessibilityRole="button"
            accessibilityLabel="Edit message"
          >
            <Text style={styles.actionText}>{editing ? "Done" : "Edit"}</Text>
          </Pressable>
          <Pressable
            onPress={() => onDelete(row.id)}
            accessibilityRole="button"
            accessibilityLabel="Delete message"
          >
            <Text style={styles.actionText}>Delete</Text>
          </Pressable>
        </View>
      </View>
    </BentoSectionCardSegment>
  );
});

function keyExtractor(row: InboxSms): string {
  return row.id;
}

function SmsInboxReviewScreen() {
  const model = useSmsInboxReviewScreenModel();
  const { editingId, formatStamp, setEditingId, updateBody, deleteRow } = model;

  const onToggleEdit = useCallback(
    (id: string) => {
      setEditingId((current) => (current === id ? null : id));
    },
    [setEditingId],
  );

  const renderItem: ListRenderItem<InboxSms> = ({ item, index }) => (
    <SmsRow
      row={item}
      isFirst={index === 0}
      isLast={index === model.remaining.length - 1}
      editing={editingId === item.id}
      stamp={formatStamp(item.dateMs)}
      onToggleEdit={onToggleEdit}
      onChangeBody={updateBody}
      onDelete={deleteRow}
    />
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
      <FlashList
        style={styles.list}
        data={model.remaining}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        extraData={editingId}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <Text style={styles.lead}>
            Review these messages. Delete junk, edit text if needed, then Sync
            to log them.
          </Text>
        }
        ListEmptyComponent={
          <BentoSectionCard>
            <Text style={styles.empty}>
              All messages removed. Sync to skip them next time.
            </Text>
          </BentoSectionCard>
        }
      />
      <View style={styles.footer}>
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
    </View>
  );
}

export default memo(SmsInboxReviewScreen);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  footer: {
    paddingHorizontal: layout.screenContent.paddingHorizontal,
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
    // The first message segment reserves top room for its card shadow.
    paddingBottom: spacing.lg - CARD_SEGMENT_SHADOW_TOP_BLEED,
  },
  list: {
    flex: 1,
  },
  listContent: {
    // Side padding lives here (not on the root) so the segment shadows are not clipped.
    paddingHorizontal: layout.screenContent.paddingHorizontal,
    paddingBottom: spacing.lg,
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

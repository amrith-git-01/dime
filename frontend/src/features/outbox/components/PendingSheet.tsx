import { Mic, Receipt, SquarePen } from "lucide-react-native";
import { memo, useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ConfirmModal } from "@/components/shared";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { discardOutboxItem, retryOutboxItem } from "@/lib/outbox/outboxQueue";
import { requestOutboxDrain } from "@/lib/outbox/outboxSync";
import type { OutboxItem } from "@/lib/outbox/outboxTypes";
import { useConnectivityStore } from "@/stores/connectivityStore";
import { useOutboxStore } from "@/stores/outboxStore";
import { usePendingSheetStore } from "@/stores/pendingSheetStore";
import { createThemedStyles, useTheme } from "@/theme";

import { usePendingTransactions } from "../hooks/usePendingTransactions";
import { describeItem, describeStatus } from "../utils/pendingStatus";

type PendingRowProps = {
  item: OutboxItem;
  now: number;
  isOnline: boolean;
  onRetry: (id: string) => void;
  onDiscard: (item: OutboxItem) => void;
};

const KIND_ICON = { manual: SquarePen, voice: Mic, receipt: Receipt } as const;

const PendingRow = memo(function PendingRow({
  item,
  now,
  isOnline,
  onRetry,
  onDiscard,
}: PendingRowProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const Icon = KIND_ICON[item.kind];
  const summary = describeItem(item);
  const status = describeStatus(item, { now, isOnline });
  const needsAttention = item.status === "failed" || item.status === "blocked";

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${summary}. ${status}`}
    >
      <View style={styles.rowTop}>
        <View style={styles.iconTile}>
          <Icon size={16} color={colors.inkSoft} strokeWidth={1.75} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.summary} numberOfLines={1}>
            {summary}
          </Text>
          <Text
            style={[styles.status, item.status === "failed" && styles.statusFailed]}
            accessibilityLiveRegion="polite"
          >
            {status}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        {needsAttention ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Retry ${summary}`}
            hitSlop={8}
            onPress={() => onRetry(item.id)}
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          >
            <Text style={styles.actionText}>Retry</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Discard ${summary}`}
          hitSlop={8}
          onPress={() => onDiscard(item)}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
        >
          <Text style={[styles.actionText, styles.actionDanger]}>Discard</Text>
        </Pressable>
      </View>
    </View>
  );
});

/**
 * The outbox as a list: what is waiting to sync, why, and what can be done (Retry a failed or
 * blocked item, Discard any, Sync now when online). Rendered once at the app root; opened from the
 * Home chip and from a pending row.
 */
export const PendingSheet = memo(function PendingSheet() {
  const visible = usePendingSheetStore((s) => s.visible);
  const close = usePendingSheetStore((s) => s.close);
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const syncing = useOutboxStore((s) => s.syncing);
  const { items } = usePendingTransactions();
  const [discarding, setDiscarding] = useState<OutboxItem | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // "Retrying in 30 s" counts down while the sheet is open.
  useEffect(() => {
    if (!visible) {
      return;
    }
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [visible]);

  // Nothing left to show: close by itself.
  useEffect(() => {
    if (visible && items.length === 0) {
      close();
    }
  }, [close, items.length, visible]);

  const syncNow = useCallback(() => {
    void requestOutboxDrain();
  }, []);
  const confirmDiscard = useCallback(() => {
    if (discarding) {
      discardOutboxItem(discarding.id);
    }
    setDiscarding(null);
  }, [discarding]);

  return (
    <>
      <ConfirmModal
        // The discard question replaces the list while it is open (two stacked modals misbehave on iOS).
        visible={visible && items.length > 0 && discarding === null}
        title={`Waiting to sync (${items.length})`}
        message={
          isOnline
            ? "These are saved on this device and will be sent shortly."
            : "These are saved on this device and will be sent when you're back online."
        }
        cancelLabel="Close"
        confirmLabel="Sync now"
        confirmBusyLabel="Syncing"
        confirmLoading={syncing}
        confirmDisabled={!isOnline}
        onCancel={close}
        onConfirm={syncNow}
      >
        <PendingList
          items={items}
          now={now}
          isOnline={isOnline}
          onRetry={retryOutboxItem}
          onDiscard={setDiscarding}
        />
      </ConfirmModal>
      <ConfirmModal
        visible={discarding !== null}
        title="Discard this entry?"
        message="It has not been saved to your account yet, so it will be gone for good."
        cancelLabel="Keep"
        confirmLabel="Discard"
        confirmTone="danger"
        onCancel={() => setDiscarding(null)}
        onConfirm={confirmDiscard}
      />
    </>
  );
});

function PendingList({
  items,
  now,
  isOnline,
  onRetry,
  onDiscard,
}: Omit<PendingRowProps, "item"> & { items: readonly OutboxItem[] }) {
  const styles = useStyles();
  return (
    <View style={styles.list}>
      {items.map((item) => (
        <PendingRow
          key={item.id}
          item={item}
          now={now}
          isOnline={isOnline}
          onRetry={onRetry}
          onDiscard={onDiscard}
        />
      ))}
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  list: {
    gap: spacing.sm,
  },
  row: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconTile: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  summary: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 19,
    color: colors.ink,
  },
  status: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  statusFailed: {
    color: colors.danger,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.lg,
  },
  action: {
    paddingVertical: 2,
  },
  actionPressed: {
    opacity: 0.6,
  },
  actionText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.accentText,
  },
  actionDanger: {
    color: colors.danger,
  },
}));

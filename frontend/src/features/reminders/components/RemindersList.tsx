import { ChevronDown, ChevronUp, Plus } from "lucide-react-native";
import { memo, useCallback, useEffect, useRef } from "react";
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  EmptyState,
  emptyStateCopy,
  ScreenSectionHeader,
} from "@/components/shared";
import { Button, SkeletonBlock } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants";
import { createThemedStyles, useTheme } from "@/theme";

import type { Reminder } from "../types";
import type { ReminderSection } from "../utils/reminderGroups";
import { ReminderRow } from "./ReminderRow";

export type RemindersListProps = {
  today: Date;
  sections: ReminderSection[];
  openCount: number;
  doneItems: Reminder[];
  doneExpanded: boolean;
  doneLoading: boolean;
  doneError: boolean;
  isLoading: boolean;
  isError: boolean;
  highlightedId: string | null;
  busyId: string | null;
  onRetry: () => void;
  onRetryDone: () => void;
  toggleDone: () => void;
  onAdd: () => void;
  onEdit: (reminder: Reminder) => void;
  onMarkDone: (reminder: Reminder, transactionId?: string) => void;
  onSkip: (reminder: Reminder) => void;
  onReopen: (reminder: Reminder) => void;
  onPayNow: (reminder: Reminder) => void;
  onNudge: (reminder: Reminder) => void;
  onDeletePress: (reminder: Reminder) => void;
};

const SKELETON_ROWS = 3;
/** Room kept above a row that is scrolled into view. */
const SCROLL_MARGIN = 16;

/**
 * The Reminders list: an Add button, the open reminders in sections (Overdue, Due soon, Later), and a
 * collapsed Done section. It owns its scroll view so it can bring a highlighted reminder into view.
 */
export const RemindersList = memo(function RemindersList(props: RemindersListProps) {
  const {
    today,
    sections,
    openCount,
    doneItems,
    doneExpanded,
    doneLoading,
    doneError,
    isLoading,
    isError,
    highlightedId,
    busyId,
  } = props;
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  // Every block reports its `y` inside its parent (onLayout). A row's place in the scroll content is
  // the sum along its chain: the sections wrapper, the section, its card, the row.
  const layoutY = useRef<Record<string, number>>({});
  const rowChain = useRef<Record<string, string[]>>({});
  const scrolledTo = useRef<string | null>(null);

  /** Scrolls to the highlighted reminder once every block above it has reported its position. */
  const scrollToHighlight = useCallback(() => {
    try {
      if (!highlightedId || scrolledTo.current === highlightedId) {
        return;
      }
      const chain = rowChain.current[highlightedId];
      if (!chain || chain.some((key) => layoutY.current[key] === undefined)) {
        return;
      }
      const y = chain.reduce((sum, key) => sum + (layoutY.current[key] ?? 0), 0);
      scrolledTo.current = highlightedId;
      scrollRef.current?.scrollTo({ y: Math.max(0, y - SCROLL_MARGIN), animated: true });
    } catch {
      // Scrolling is a nicety; the row is tinted either way.
    }
  }, [highlightedId]);

  // Layout events can arrive before or after the highlight is set: try on both sides.
  useEffect(() => {
    if (!highlightedId) {
      scrolledTo.current = null;
    }
    scrollToHighlight();
  }, [highlightedId, scrollToHighlight, sections, doneItems]);

  const onBlockLayout = useCallback(
    (key: string, chain?: string[], rowId?: string) => (event: LayoutChangeEvent) => {
      layoutY.current[key] = event.nativeEvent.layout.y;
      if (rowId && chain) {
        rowChain.current[rowId] = [...chain, key];
      }
      scrollToHighlight();
    },
    [scrollToHighlight],
  );

  const renderRow = (reminder: Reminder) => (
    <View key={reminder.id} collapsable={false}>
      <ReminderRow
        reminder={reminder}
        today={today}
        highlighted={reminder.id === highlightedId}
        busy={reminder.id === busyId}
        onPress={props.onEdit}
        onMarkDone={props.onMarkDone}
        onPayNow={props.onPayNow}
        onNudge={props.onNudge}
        onSkip={props.onSkip}
        onDelete={props.onDeletePress}
        onReopen={props.onReopen}
      />
    </View>
  );

  const renderCard = (rows: Reminder[], groupKey: string, parents: string[]) => (
    <View style={styles.card} onLayout={onBlockLayout(`card:${groupKey}`)}>
      {rows.map((reminder, index) => (
        <View
          key={reminder.id}
          onLayout={onBlockLayout(`row:${reminder.id}`, [...parents, `card:${groupKey}`], reminder.id)}
        >
          {index > 0 ? <View style={styles.divider} /> : null}
          {renderRow(reminder)}
        </View>
      ))}
    </View>
  );

  let body;
  if (isLoading) {
    body = (
      <View style={styles.card}>
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <View key={index}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <View style={styles.skeletonRow}>
              <SkeletonBlock style={styles.skeletonTile} />
              <View style={styles.skeletonMeta}>
                <SkeletonBlock style={styles.skeletonPrimary} />
                <SkeletonBlock style={styles.skeletonSecondary} />
              </View>
              <SkeletonBlock style={styles.skeletonAmount} />
            </View>
          </View>
        ))}
      </View>
    );
  } else if (isError) {
    body = (
      <EmptyState
        layout="card"
        headline={emptyStateCopy.remindersError.headline}
        subtext={emptyStateCopy.remindersError.subtext}
        actionLabel="Try again"
        onAction={props.onRetry}
      />
    );
  } else if (openCount === 0) {
    body = (
      <EmptyState
        layout="card"
        headline={emptyStateCopy.reminders.headline}
        subtext={emptyStateCopy.reminders.subtext}
        actionLabel={emptyStateCopy.reminders.actionLabel}
        onAction={props.onAdd}
      />
    );
  } else {
    body = (
      <View style={styles.sections} onLayout={onBlockLayout("sections")}>
        {sections.map((section) => (
          <View key={section.id} onLayout={onBlockLayout(`section:${section.id}`)}>
            <ScreenSectionHeader title={section.title} />
            {renderCard(section.items, section.id, ["sections", `section:${section.id}`])}
          </View>
        ))}
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: spacing.xl + insets.bottom },
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {openCount > 0 ? (
        <Button
          title="Add reminder"
          size="compact"
          variant="secondary"
          leadingIcon={<Plus size={16} color={colors.ink} strokeWidth={2} />}
          onPress={props.onAdd}
        />
      ) : null}

      {body}

      {isLoading || isError ? null : (
        <View onLayout={onBlockLayout("done")}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: doneExpanded }}
            accessibilityLabel={doneExpanded ? "Hide done reminders" : "Show done reminders"}
            onPress={props.toggleDone}
            style={({ pressed }) => [styles.doneHeader, pressed && styles.pressed]}
          >
            <Text style={styles.doneTitle}>Done</Text>
            {doneExpanded ? (
              <ChevronUp size={18} color={colors.inkSoft} strokeWidth={1.75} />
            ) : (
              <ChevronDown size={18} color={colors.inkSoft} strokeWidth={1.75} />
            )}
          </Pressable>
          {doneExpanded ? (
            doneLoading ? (
              <View style={styles.card}>
                <View style={styles.skeletonRow}>
                  <SkeletonBlock style={styles.skeletonTile} />
                  <View style={styles.skeletonMeta}>
                    <SkeletonBlock style={styles.skeletonPrimary} />
                    <SkeletonBlock style={styles.skeletonSecondary} />
                  </View>
                </View>
              </View>
            ) : doneError ? (
              <View style={styles.card}>
                <View style={styles.doneEmpty}>
                  <Text style={styles.doneEmptyText}>Could not load done reminders.</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={props.onRetryDone}
                    style={styles.retry}
                  >
                    <Text style={styles.retryText}>Try again</Text>
                  </Pressable>
                </View>
              </View>
            ) : doneItems.length === 0 ? (
              <View style={styles.card}>
                <View style={styles.doneEmpty}>
                  <Text style={styles.doneEmptyText}>
                    Nothing done yet. Paid reminders show up here.
                  </Text>
                </View>
              </View>
            ) : (
              renderCard(doneItems, "done", ["done"])
            )
          ) : null}
        </View>
      )}
    </ScrollView>
  );
});

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  scroll: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.xl,
  },
  sections: {
    gap: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadows.card,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginHorizontal: spacing.lg,
  },
  doneHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    marginBottom: spacing.sm,
  },
  doneTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  pressed: {
    opacity: 0.7,
  },
  doneEmpty: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  doneEmptyText: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  retry: {
    minHeight: 44,
    justifyContent: "center",
  },
  retryText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.accentText,
  },
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  skeletonTile: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
  },
  skeletonMeta: {
    flex: 1,
    gap: 6,
  },
  skeletonPrimary: {
    height: 14,
    width: "55%",
    borderRadius: 4,
  },
  skeletonSecondary: {
    height: 11,
    width: "35%",
    borderRadius: 4,
  },
  skeletonAmount: {
    height: 14,
    width: 56,
    borderRadius: 4,
  },
}));

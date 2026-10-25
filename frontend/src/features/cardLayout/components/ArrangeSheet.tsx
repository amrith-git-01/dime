import { memo, useCallback, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radius } from "@/constants/radius";
import { fontFamilies } from "@/constants/fonts";
import { springs } from "@/constants/motion";
import { spacing } from "@/constants/spacing";
import { createThemedStyles } from "@/theme";

import {
  DEFAULT_CARD_ORDER,
  type CardId,
  type CardScreen,
} from "../cardIds";
import { CARD_META, CARD_SCREEN_TITLES } from "../cardMeta";
import { normalizeCardOrder, sameOrder } from "../normalizeCardOrder";

import { SortableList, type SortableItem } from "./SortableList";

/** Drag the grabber down this far (dp) or flick it, and the sheet closes without saving. */
const DISMISS_DISTANCE = 100;
const DISMISS_VELOCITY = 900;
const DISMISS_MS = 160;
const SHEET_MAX_HEIGHT_RATIO = 0.9;

export type ArrangeSheetProps = {
  visible: boolean;
  screen: CardScreen;
  /** The order the screen shows now: where the list starts. */
  order: readonly string[];
  /** Cancel, backdrop tap, Android back, drag-down: nothing is saved. */
  onCancel: () => void;
  /** Done: the order to apply and save. */
  onDone: (order: CardId[]) => void;
};

/**
 * Bottom sheet to rearrange a screen's cards: header (Cancel, "Arrange <screen>", Done), the cards
 * as a drag list and "Reset to default" under it. Edits live in the sheet until Done; Reset only
 * resets the list (it applies on Done). Mount a fresh one (a new `key`) for each opening.
 */
export const ArrangeSheet = memo(function ArrangeSheet({
  visible,
  screen,
  order,
  onCancel,
  onDone,
}: ArrangeSheetProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const defaults = DEFAULT_CARD_ORDER[screen] as readonly CardId[];
  const items = useMemo<SortableItem[]>(
    () =>
      defaults.map((id) => ({
        id,
        label: CARD_META[id].name,
        icon: CARD_META[id].icon,
      })),
    [defaults],
  );
  const [draft, setDraft] = useState<readonly CardId[]>(() =>
    normalizeCardOrder<CardId>(order, defaults),
  );
  const [contentHeight, setContentHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const isDefault = sameOrder(draft, defaults);
  const title = CARD_SCREEN_TITLES[screen];

  const onOrderChange = useCallback((next: string[]) => {
    setDraft(next as CardId[]);
  }, []);

  const sheetY = useSharedValue(0);
  const grabberPan = Gesture.Pan()
    .onUpdate((event) => {
      sheetY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (
        event.translationY > DISMISS_DISTANCE ||
        event.velocityY > DISMISS_VELOCITY
      ) {
        // Out of sight first, so the modal's own slide-out has nothing left to show.
        sheetY.value = withTiming(windowHeight, { duration: DISMISS_MS }, (finished) => {
          if (finished) {
            runOnJS(onCancel)();
          }
        });
      } else {
        sheetY.value = withSpring(0, springs.smooth);
      }
    });
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));

  const maxSheetHeight = windowHeight * SHEET_MAX_HEIGHT_RATIO;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <GestureHandlerRootView style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Close without saving"
        />
        <Animated.View
          style={[
            styles.sheet,
            { maxHeight: maxSheetHeight, paddingBottom: insets.bottom + spacing.lg },
            sheetStyle,
          ]}
          accessibilityViewIsModal
        >
          <GestureDetector gesture={grabberPan}>
            <View style={styles.grabberArea} accessibilityLabel="Drag down to close">
              <View style={styles.grabber} />
            </View>
          </GestureDetector>

          <View style={styles.header}>
            <Pressable
              style={styles.headerButton}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
              {title}
            </Text>
            <Pressable
              style={[styles.headerButton, styles.headerButtonEnd]}
              onPress={() => onDone([...draft])}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
            scrollEnabled={contentHeight > viewportHeight + 1}
            onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
            onContentSizeChange={(_, height) => setContentHeight(height)}
          >
            <SortableList items={items} order={draft} onOrderChange={onOrderChange} />
          </ScrollView>

          <Pressable
            style={styles.reset}
            onPress={() => setDraft([...defaults])}
            disabled={isDefault}
            accessibilityRole="button"
            accessibilityLabel="Reset to default"
            accessibilityState={{ disabled: isDefault }}
          >
            <Text style={[styles.resetText, isDefault && styles.resetTextDisabled]}>
              Reset to default
            </Text>
          </Pressable>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlays.scrim,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
  },
  grabberArea: {
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.line,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    marginBottom: spacing.sm,
  },
  headerButton: {
    minWidth: 72,
    minHeight: 48,
    justifyContent: "center",
  },
  headerButtonEnd: {
    alignItems: "flex-end",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontFamily: fontFamilies.semiBold,
    fontSize: 17,
    lineHeight: 24,
    color: colors.ink,
  },
  cancelText: {
    fontFamily: fontFamilies.medium,
    fontSize: 16,
    lineHeight: 22,
    color: colors.inkSoft,
  },
  doneText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.accentText,
  },
  // Wider than the rows on purpose: a lifted row grows a little and casts a shadow, and a
  // scroll view clips what sticks out of it.
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
    marginHorizontal: -spacing.sm,
  },
  scrollContent: {
    flexGrow: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  reset: {
    alignSelf: "center",
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  resetText: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.accentText,
  },
  resetTextDisabled: {
    color: colors.inkFaint,
  },
}));

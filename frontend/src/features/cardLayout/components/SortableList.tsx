import { GripVertical, type LucideIcon } from "lucide-react-native";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Text,
  View,
  type AccessibilityActionEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";

import { radius } from "@/constants/radius";
import { fontFamilies } from "@/constants/fonts";
import { springs } from "@/constants/motion";
import { spacing } from "@/constants/spacing";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import {
  triggerConfirmHaptic,
  triggerTickHaptic,
} from "@/lib/haptics/nativeHaptics";
import { createThemedStyles, useTheme } from "@/theme";

import { sameOrder } from "../normalizeCardOrder";
import {
  moveInOrder,
  NO_ACTIVE_ROW,
  orderFromSlots,
  slotsFromOrder,
  SORT_ROW_HEIGHT,
} from "../sortableMath";

import {
  dragWorklet,
  dropWorklet,
  GRIP_BODY,
  GRIP_HANDLE,
  liftWorklet,
} from "./sortableWorklets";

/** Press-and-hold on a row this long lifts it; the handle lifts it at once. */
export const SORT_LONG_PRESS_MS = 250;
const LIFT_SCALE = 0.03;
const LIFT_ELEVATION = 8;
const LIFT_SHADOW_OPACITY = 0.18;
const ROW_INSET = 4;
const ROW_VISIBLE_HEIGHT = SORT_ROW_HEIGHT - ROW_INSET * 2;

export type SortableItem = {
  id: string;
  label: string;
  icon: LucideIcon;
};

export type SortableListProps = {
  /** Every item, in a fixed order (the default one). Rows are keyed by these and never remount. */
  items: readonly SortableItem[];
  /** The order to show. Changing it from outside (Reset) slides the rows to it. */
  order: readonly string[];
  /** The order after a drop or a Move up / Move down action. */
  onOrderChange: (order: string[]) => void;
};

type SortableRowProps = {
  item: SortableItem;
  /** Index in the fixed `items` list: the key into `slots`. */
  k: number;
  count: number;
  initialSlot: number;
  /** 1-based position in the current order, for the screen reader. */
  position: number;
  slots: SharedValue<number[]>;
  activeKey: SharedValue<number>;
  reduceMotion: boolean;
  onSlotChange: () => void;
  onDrop: (slots: number[]) => void;
  onMove: (id: string, delta: -1 | 1) => void;
};

const SortableRow = memo(function SortableRow({
  item,
  k,
  count,
  initialSlot,
  position,
  slots,
  activeKey,
  reduceMotion,
  onSlotChange,
  onDrop,
  onMove,
}: SortableRowProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const Icon = item.icon;
  const y = useSharedValue(initialSlot * SORT_ROW_HEIGHT);
  const startY = useSharedValue(0);
  const lift = useSharedValue(0);
  const owner = useSharedValue(0);

  // Rows that are not being held slide to their new slot.
  useAnimatedReaction(
    () => slots.value[k],
    (slot, previous) => {
      if (previous === null || slot === previous || activeKey.value === k) {
        return;
      }
      const target = slot * SORT_ROW_HEIGHT;
      y.value = reduceMotion ? target : withSpring(target, springs.snappy);
    },
    [reduceMotion],
  );

  // One finger per grip, and one row held at a time (see `liftWorklet`).
  const bodyGesture = Gesture.Pan()
    .maxPointers(1)
    .activateAfterLongPress(SORT_LONG_PRESS_MS)
    .onStart(() => {
      liftWorklet(k, GRIP_BODY, y, startY, lift, activeKey, owner, reduceMotion);
    })
    .onUpdate((event) => {
      dragWorklet(
        k,
        GRIP_BODY,
        event.translationY,
        count,
        y,
        startY,
        slots,
        activeKey,
        owner,
        onSlotChange,
      );
    })
    .onFinalize(() => {
      dropWorklet(k, GRIP_BODY, y, lift, slots, activeKey, owner, reduceMotion, onDrop);
    });

  const handleGesture = Gesture.Pan()
    .maxPointers(1)
    .onBegin(() => {
      liftWorklet(k, GRIP_HANDLE, y, startY, lift, activeKey, owner, reduceMotion);
    })
    .onUpdate((event) => {
      dragWorklet(
        k,
        GRIP_HANDLE,
        event.translationY,
        count,
        y,
        startY,
        slots,
        activeKey,
        owner,
        onSlotChange,
      );
    })
    .onFinalize(() => {
      dropWorklet(k, GRIP_HANDLE, y, lift, slots, activeKey, owner, reduceMotion, onDrop);
    });

  const slotStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: y.value },
      { scale: reduceMotion ? 1 : 1 + LIFT_SCALE * lift.value },
    ],
    zIndex: lift.value > 0.01 ? 10 : 0,
  }));
  const rowStyle = useAnimatedStyle(() => ({
    shadowOpacity: reduceMotion ? 0 : LIFT_SHADOW_OPACITY * lift.value,
    elevation: reduceMotion ? 0 : LIFT_ELEVATION * lift.value,
  }));

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === "moveUp") {
      onMove(item.id, -1);
    } else if (event.nativeEvent.actionName === "moveDown") {
      onMove(item.id, 1);
    }
  };

  return (
    <Animated.View
      style={[styles.slot, slotStyle]}
      accessible
      accessibilityLabel={`${item.label}, position ${position} of ${count}`}
      accessibilityHint="Use the actions to move it up or down"
      accessibilityActions={[
        { name: "moveUp", label: "Move up" },
        { name: "moveDown", label: "Move down" },
      ]}
      onAccessibilityAction={onAccessibilityAction}
    >
      <Animated.View style={[styles.row, rowStyle]}>
        <GestureDetector gesture={bodyGesture}>
          <View style={styles.body}>
            <View style={styles.iconTile}>
              <Icon color={colors.accentText} size={18} strokeWidth={1.75} />
            </View>
            <Text style={styles.label} numberOfLines={1}>
              {item.label}
            </Text>
          </View>
        </GestureDetector>
        <GestureDetector gesture={handleGesture}>
          <View
            style={styles.handle}
            accessibilityLabel={`Drag to reorder ${item.label}`}
          >
            <GripVertical color={colors.inkFaint} size={20} strokeWidth={1.75} />
          </View>
        </GestureDetector>
      </Animated.View>
    </Animated.View>
  );
});

/**
 * A short list of fixed-height rows you reorder by dragging: press and hold a row (or grab its
 * handle) to lift it, the others slide aside, drop to settle. All the drag maths is on the UI
 * thread (shared values + Gesture Handler); the JS side hears about it only when the row crosses
 * into another slot (a tick haptic) and on drop (the new order). Screen readers get Move up /
 * Move down actions on each row instead.
 */
export function SortableList({
  items,
  order,
  onOrderChange,
}: SortableListProps) {
  const styles = useStyles();
  const reduceMotion = useReduceMotion();
  const count = items.length;
  const [initialSlots] = useState(() =>
    slotsFromOrder(
      items.map((item) => item.id),
      order,
    ),
  );
  const slots = useSharedValue<number[]>(initialSlots);
  const activeKey = useSharedValue(NO_ACTIVE_ROW);
  // The last order this list reported (or was given): tells a change from outside from its own echo.
  const known = useRef<readonly string[]>(order);

  useEffect(() => {
    if (sameOrder(order, known.current)) {
      return;
    }
    known.current = order;
    slots.value = slotsFromOrder(
      items.map((item) => item.id),
      order,
    );
  }, [items, order, slots]);

  const onSlotChange = useCallback(() => {
    void triggerTickHaptic();
  }, []);

  const onDrop = useCallback(
    (finalSlots: number[]) => {
      const next = orderFromSlots(
        items.map((item) => item.id),
        finalSlots,
      );
      if (sameOrder(next, known.current)) {
        return;
      }
      known.current = next;
      void triggerConfirmHaptic();
      onOrderChange(next);
    },
    [items, onOrderChange],
  );

  const onMove = useCallback(
    (id: string, delta: -1 | 1) => {
      const next = moveInOrder(known.current, id, delta);
      const label = items.find((item) => item.id === id)?.label ?? "";
      if (!sameOrder(next, known.current)) {
        known.current = next;
        slots.value = slotsFromOrder(
          items.map((item) => item.id),
          next,
        );
        void triggerTickHaptic();
        onOrderChange(next);
      }
      AccessibilityInfo.announceForAccessibility(
        `${label}, position ${next.indexOf(id) + 1} of ${next.length}`,
      );
    },
    [items, onOrderChange, slots],
  );

  return (
    <View style={[styles.list, { height: count * SORT_ROW_HEIGHT }]}>
      {items.map((item, k) => (
        <SortableRow
          key={item.id}
          item={item}
          k={k}
          count={count}
          initialSlot={initialSlots[k]}
          position={order.indexOf(item.id) + 1}
          slots={slots}
          activeKey={activeKey}
          reduceMotion={reduceMotion}
          onSlotChange={onSlotChange}
          onDrop={onDrop}
          onMove={onMove}
        />
      ))}
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  list: {
    position: "relative",
  },
  slot: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: SORT_ROW_HEIGHT,
    paddingVertical: ROW_INSET,
  },
  row: {
    flex: 1,
    height: ROW_VISIBLE_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSunken,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    shadowOpacity: 0,
  },
  body: {
    flex: 1,
    height: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingLeft: spacing.md,
  },
  iconTile: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentTint,
  },
  label: {
    flex: 1,
    fontFamily: fontFamilies.medium,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  handle: {
    width: 52,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
}));

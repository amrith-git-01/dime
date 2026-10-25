import {
  runOnJS,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";

import { springs } from "@/constants/motion";

import {
  canLiftRow,
  clampDragOffset,
  NO_ACTIVE_ROW,
  reorderSlots,
  SORT_ROW_HEIGHT,
  targetIndexFromOffset,
} from "../sortableMath";

// UI-thread helpers: all drag maths runs here, never on the JS thread.

/** Which grip of a row is driving it: lets one grip's end never drop what the other (or another row) is doing. */
export const GRIP_BODY = 1;
export const GRIP_HANDLE = 2;

export function liftWorklet(
  k: number,
  grip: number,
  y: SharedValue<number>,
  startY: SharedValue<number>,
  lift: SharedValue<number>,
  activeKey: SharedValue<number>,
  owner: SharedValue<number>,
  reduceMotion: boolean,
) {
  "worklet";
  // Another finger already holds a row: this touch does nothing (and its end is ignored too).
  if (!canLiftRow(activeKey.value)) {
    return;
  }
  activeKey.value = k;
  owner.value = grip;
  startY.value = y.value;
  lift.value = reduceMotion ? 1 : withSpring(1, springs.snappy);
}

export function dragWorklet(
  k: number,
  grip: number,
  translationY: number,
  count: number,
  y: SharedValue<number>,
  startY: SharedValue<number>,
  slots: SharedValue<number[]>,
  activeKey: SharedValue<number>,
  owner: SharedValue<number>,
  onSlotChange: () => void,
) {
  "worklet";
  if (activeKey.value !== k || owner.value !== grip) {
    return;
  }
  const next = clampDragOffset(
    startY.value + translationY,
    SORT_ROW_HEIGHT,
    count,
  );
  y.value = next;
  const to = targetIndexFromOffset(next, SORT_ROW_HEIGHT, count);
  if (to !== slots.value[k]) {
    slots.value = reorderSlots(slots.value, k, to);
    runOnJS(onSlotChange)();
  }
}

export function dropWorklet(
  k: number,
  grip: number,
  y: SharedValue<number>,
  lift: SharedValue<number>,
  slots: SharedValue<number[]>,
  activeKey: SharedValue<number>,
  owner: SharedValue<number>,
  reduceMotion: boolean,
  onDrop: (slots: number[]) => void,
) {
  "worklet";
  if (activeKey.value !== k || owner.value !== grip) {
    return;
  }
  activeKey.value = NO_ACTIVE_ROW;
  owner.value = 0;
  const target = slots.value[k] * SORT_ROW_HEIGHT;
  y.value = reduceMotion ? target : withSpring(target, springs.smooth);
  lift.value = reduceMotion ? 0 : withSpring(0, springs.smooth);
  runOnJS(onDrop)(slots.value);
}


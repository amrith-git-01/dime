import { ChevronRight } from "lucide-react-native";
import { memo, useEffect, useRef } from "react";
import { Pressable, Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { spacing } from "@/constants/spacing";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { useCelebrationStore } from "@/stores/celebrationStore";
import { createThemedStyles, useTheme } from "@/theme";

import {
  CHECKLIST_ITEM_HINTS,
  CHECKLIST_ITEM_LABELS,
} from "../constants/checklistItems";
import type { ChecklistItemId } from "../types";
import { checklistRowLabel } from "../utils/checklist";

import { ChecklistCheck, CHECKLIST_CHECK_SIZE } from "./ChecklistCheck";

export type ChecklistRowProps = {
  id: ChecklistItemId;
  done: boolean;
  /** The item just turned done: draw its check in. */
  animateCheck: boolean;
  /** ...and burst from the check (only one row per moment bursts). */
  burst: boolean;
  reduceMotion: boolean;
  onPress: (id: ChecklistItemId) => void;
};

/** One tappable row: check circle, label, a hint while open, and a chevron. At least 44dp tall. */
export const ChecklistRow = memo(function ChecklistRow({
  id,
  done,
  animateCheck,
  burst,
  reduceMotion,
  onPress,
}: ChecklistRowProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const checkRef = useRef<View>(null);
  const label = CHECKLIST_ITEM_LABELS[id];

  // Measured once the row is laid out, so the burst starts on the check, not in the middle of the screen.
  useEffect(() => {
    if (!burst) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      checkRef.current?.measureInWindow((x, y, width, height) => {
        useCelebrationStore.getState().celebrate({
          kind: "burst",
          at: { x: x + width / 2, y: y + height / 2 },
        });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [burst]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={checklistRowLabel(label, done)}
      onPress={() => {
        void triggerHaptic();
        onPress(id);
      }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View ref={checkRef} collapsable={false} style={styles.check}>
        <ChecklistCheck
          done={done}
          animate={animateCheck}
          reduceMotion={reduceMotion}
        />
      </View>
      <View style={styles.text}>
        <Text style={[styles.label, done && styles.labelDone]} numberOfLines={2}>
          {label}
        </Text>
        {done ? null : (
          <Text style={styles.hint} numberOfLines={1}>
            {CHECKLIST_ITEM_HINTS[id]}
          </Text>
        )}
      </View>
      <ChevronRight size={16} color={colors.inkFaint} strokeWidth={2} />
    </Pressable>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  rowPressed: {
    backgroundColor: colors.surfaceSunken,
  },
  check: {
    width: CHECKLIST_CHECK_SIZE,
    height: CHECKLIST_CHECK_SIZE,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
  labelDone: {
    color: colors.inkSoft,
    textDecorationLine: "line-through",
  },
  hint: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
}));

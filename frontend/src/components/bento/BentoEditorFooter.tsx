import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  BUTTON_LOADER_SIZE,
  InfinityButtonLoader,
} from "@/components/ui";
import {
  accent,
  ink,
  inkFaint,
  line,
  radius,
  spacing,
  surface,
} from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";

export type BentoEditorFooterProps = {
  onClear: () => void;
  onSave: () => void;
  saveTitle?: string;
  clearTitle?: string;
  saveLoading?: boolean;
  saveDisabled?: boolean;
  clearDisabled?: boolean;
};

/**
 * Clear + primary action row for stack bento form editors.
 * Matches ManualAdd / category / budget editor footers (full pill, accent save).
 */
export const BentoEditorFooter = memo(function BentoEditorFooter({
  onClear,
  onSave,
  saveTitle = "Save",
  clearTitle = "Clear",
  saveLoading = false,
  saveDisabled = false,
  clearDisabled = false,
}: BentoEditorFooterProps) {
  const saveBlocked = saveDisabled || saveLoading;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => {
          if (clearDisabled) {
            return;
          }
          void triggerHaptic();
          onClear();
        }}
        disabled={clearDisabled}
        accessibilityRole="button"
        accessibilityLabel={clearTitle}
        style={({ pressed }) => [
          styles.clearBtn,
          clearDisabled && styles.clearBtnDisabled,
          pressed && !clearDisabled && styles.clearBtnPressed,
        ]}
      >
        <Text
          style={[
            styles.clearBtnText,
            clearDisabled && styles.clearBtnTextDisabled,
          ]}
        >
          {clearTitle}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => {
          if (saveBlocked) {
            return;
          }
          void triggerHaptic();
          onSave();
        }}
        disabled={saveBlocked}
        accessibilityRole="button"
        accessibilityLabel={saveTitle}
        style={({ pressed }) => [
          styles.saveBtn,
          saveBlocked && styles.saveBtnDisabled,
          pressed && !saveBlocked && styles.saveBtnPressed,
        ]}
      >
        {saveLoading ? (
          <InfinityButtonLoader color={surface} size={BUTTON_LOADER_SIZE} />
        ) : (
          <Text style={styles.saveBtnText}>{saveTitle}</Text>
        )}
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  clearBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: line,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  clearBtnDisabled: {
    opacity: 0.4,
  },
  clearBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  clearBtnText: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
    color: ink,
  },
  clearBtnTextDisabled: {
    color: inkFaint,
  },
  saveBtn: {
    flex: 2,
    minHeight: 50,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    backgroundColor: accent,
  },
  saveBtnDisabled: {
    opacity: 0.45,
  },
  saveBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  saveBtnText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: surface,
  },
});

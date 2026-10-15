import { memo } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui";
import { spacing } from "@/constants";
import { createThemedStyles } from "@/theme";

export type BentoEditorFooterProps = {
  onClear: () => void;
  onSave: () => void;
  saveTitle?: string;
  /** Continuous-tense label while saving; derived from `saveTitle` when omitted. */
  saveBusyLabel?: string;
  clearTitle?: string;
  saveLoading?: boolean;
  saveDisabled?: boolean;
  clearDisabled?: boolean;
};

/**
 * Clear + primary action row for stack bento form editors and settings editors
 * (secondary flex 1, primary flex 2).
 */
export const BentoEditorFooter = memo(function BentoEditorFooter({
  onClear,
  onSave,
  saveTitle = "Save",
  saveBusyLabel,
  clearTitle = "Clear",
  saveLoading = false,
  saveDisabled = false,
  clearDisabled = false,
}: BentoEditorFooterProps) {
  const styles = useStyles();

  return (
    <View style={styles.row}>
      <View style={styles.clearSlot}>
        <Button
          title={clearTitle}
          variant="secondary"
          onPress={onClear}
          disabled={clearDisabled}
          accessibilityLabel={clearTitle}
        />
      </View>
      <View style={styles.saveSlot}>
        <Button
          title={saveTitle}
          busyLabel={saveBusyLabel}
          onPress={onSave}
          loading={saveLoading}
          disabled={saveDisabled}
          accessibilityLabel={saveTitle}
        />
      </View>
    </View>
  );
});

const useStyles = createThemedStyles(() => ({
  row: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  clearSlot: {
    flex: 1,
  },
  saveSlot: {
    flex: 2,
  },
}));

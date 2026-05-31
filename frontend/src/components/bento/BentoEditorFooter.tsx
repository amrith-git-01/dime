import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/ui/Button/Button";
import { spacing } from "@/constants";

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
 * Clear + primary action row for stack bento form editors (inside card body).
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
  return (
    <View style={styles.row}>
      <View style={styles.buttonWrap}>
        <Button
          variant="secondary"
          title={clearTitle}
          onPress={onClear}
          disabled={clearDisabled}
        />
      </View>
      <View style={styles.buttonWrap}>
        <Button
          title={saveTitle}
          loading={saveLoading}
          onPress={onSave}
          disabled={saveDisabled}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  buttonWrap: {
    flex: 1,
  },
});

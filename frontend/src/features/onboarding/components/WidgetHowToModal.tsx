import { memo } from "react";
import { Text, View } from "react-native";

import { ConfirmModal } from "@/components/shared";
import { fontFamilies } from "@/constants/fonts";
import { spacing } from "@/constants/spacing";
import { createThemedStyles } from "@/theme";

const STEPS = [
  "Long-press an empty spot on your home screen",
  "Tap Widgets and find Dime",
  "Drag the 4×3 widget onto your home screen",
] as const;

export type WidgetHowToModalProps = {
  visible: boolean;
  onClose: () => void;
};

/**
 * How to add the home-screen widget. Android cannot add a widget for the user without the system
 * prompt, so this only explains; the checklist item ticks when the launcher really adds one.
 */
export const WidgetHowToModal = memo(function WidgetHowToModal({
  visible,
  onClose,
}: WidgetHowToModalProps) {
  const styles = useStyles();
  return (
    <ConfirmModal
      visible={visible}
      title="Add the Dime widget"
      message="Log an expense without opening the app."
      showCancel={false}
      confirmLabel="Done"
      onCancel={onClose}
      onConfirm={onClose}
    >
      <View style={styles.steps}>
        {STEPS.map((step, index) => (
          <View key={step} style={styles.step}>
            <View style={styles.number}>
              <Text style={styles.numberText}>{index + 1}</Text>
            </View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>
    </ConfirmModal>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  steps: {
    gap: spacing.md,
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  number: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accentTint,
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.accentText,
  },
  stepText: {
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
}));

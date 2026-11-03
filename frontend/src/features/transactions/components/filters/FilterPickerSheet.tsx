import { memo, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { createThemedStyles } from "@/theme";

export type FilterPickerSheetProps = {
  title: string;
  /** Done, backdrop tap or Android back. The picker has already applied every change it made. */
  onClose: () => void;
  children: ReactNode;
};

/**
 * Small bottom sheet that holds one filter's picker. Choices apply the moment they are made, so
 * there is no Apply / Cancel: "Done" only closes it. Render it only while open.
 */
export const FilterPickerSheet = memo(function FilterPickerSheet({
  title,
  onClose,
  children,
}: FilterPickerSheetProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={`Close ${title.toLowerCase()} filter`}
        />
        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}
          accessibilityViewIsModal
        >
          <View style={styles.grabberArea}>
            <View style={styles.grabber} />
          </View>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
              {title}
            </Text>
            <Pressable
              style={styles.doneButton}
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
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
    backgroundColor: colors.overlays.scrimLight,
  },
  sheet: {
    maxHeight: "75%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
  },
  grabberArea: {
    height: 24,
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
    justifyContent: "space-between",
    minHeight: 44,
    marginBottom: spacing.xs,
  },
  title: {
    flex: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 17,
    lineHeight: 24,
    color: colors.ink,
  },
  doneButton: {
    minHeight: 44,
    paddingLeft: spacing.lg,
    justifyContent: "center",
  },
  doneText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.accentText,
  },
}));

import { CircleQuestionMark, RotateCcw, X } from "lucide-react-native";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { DimeMark } from "@/components/brand/DimeMark";
import { spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { createThemedStyles, useTheme } from "@/theme";

type AgentChatHeaderProps = {
  onReset: () => void;
  onClose: () => void;
  /** Opens the Ask AI tour. */
  onHelp: () => void;
  /** A question is being answered; the tour waits until it is done. */
  helpDisabled?: boolean;
};

/** Title row of the agent panel with the clear-chat and close actions. */
export const AgentChatHeader = memo(function AgentChatHeader({
  onReset,
  onClose,
  onHelp,
  helpDisabled = false,
}: AgentChatHeaderProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <DimeMark size={24} color={colors.accentText} />
        <Text style={styles.title}>Dime Agent</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Take a tour of Ask AI"
          accessibilityState={{ disabled: helpDisabled }}
          disabled={helpDisabled}
          onPress={onHelp}
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconButton,
            (pressed || helpDisabled) && styles.iconButtonPressed,
          ]}
        >
          <CircleQuestionMark size={20} color={colors.inkSoft} strokeWidth={2} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear chat"
          onPress={onReset}
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconButton,
            pressed && styles.iconButtonPressed,
          ]}
        >
          <RotateCcw size={20} color={colors.inkSoft} strokeWidth={2} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconButton,
            pressed && styles.iconButtonPressed,
          ]}
        >
          <X size={22} color={colors.inkSoft} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 14,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    color: colors.ink,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonPressed: {
    opacity: 0.7,
  },
}));

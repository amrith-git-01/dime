import { RotateCcw, Sparkles, X } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { accent, ink, inkSoft, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

type AgentChatHeaderProps = {
  onReset: () => void;
  onClose: () => void;
};

/** Title row of the agent panel with the clear-chat and close actions. */
export const AgentChatHeader = memo(function AgentChatHeader({
  onReset,
  onClose,
}: AgentChatHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Sparkles size={20} color={accent} strokeWidth={2} />
        <Text style={styles.title}>Dime Agent</Text>
      </View>
      <View style={styles.actions}>
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
          <RotateCcw size={20} color={inkSoft} strokeWidth={2} />
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
          <X size={22} color={inkSoft} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
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
    color: ink,
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
});

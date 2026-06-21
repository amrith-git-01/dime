import { memo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { spacing } from "@/constants/spacing";
import { sectionHeaderTitle } from "@/constants/typography";

export type ScreenSectionHeaderProps = {
  title: string;
  /** Right-side actions — e.g. "View all" or "Add" pill. */
  action?: ReactNode;
};

export const ScreenSectionHeader = memo(function ScreenSectionHeader({
  title,
  action,
}: ScreenSectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {action ? <View style={styles.actions}>{action}</View> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  title: sectionHeaderTitle,
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
});

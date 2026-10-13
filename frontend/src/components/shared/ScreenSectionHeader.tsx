import { memo, type ReactNode } from "react";
import { Text, View } from "react-native";

import { spacing } from "@/constants/spacing";
import { createThemedStyles } from "@/theme";

export type ScreenSectionHeaderProps = {
  title: string;
  /** Right-side actions — e.g. "View all" or "Add" pill. */
  action?: ReactNode;
};

export const ScreenSectionHeader = memo(function ScreenSectionHeader({
  title,
  action,
}: ScreenSectionHeaderProps) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {action ? <View style={styles.actions}>{action}</View> : null}
    </View>
  );
});

const useStyles = createThemedStyles(({ typography }) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  title: typography.sectionHeaderTitle,
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
}));

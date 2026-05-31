import { StyleSheet } from "react-native";

import type { StackScreenShellProps } from "@/components/layout/StackScreenShell";
import { spacing } from "@/constants/theme";

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: spacing.lg,
  },
});

export const settingsStackShellConfig: Pick<
  StackScreenShellProps,
  "contentContainerStyle"
> = {
  contentContainerStyle: styles.scrollContent,
};

import { StyleSheet } from "react-native";

import type { StackScreenShellProps } from "@/components/layout/StackScreenShell";

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
});

export const insightsMonthCompareStackShellConfig: Pick<
  StackScreenShellProps,
  "contentContainerStyle"
> = {
  contentContainerStyle: styles.scrollContent,
};

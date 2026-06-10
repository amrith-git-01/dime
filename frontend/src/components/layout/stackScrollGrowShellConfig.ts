import { StyleSheet } from "react-native";

import type { StackScreenShellProps } from "./StackScreenShell";

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
});

/** Centers empty states in stack scroll screens (notifications, lists, compare). */
export const stackScrollGrowShellConfig: Pick<
  StackScreenShellProps,
  "contentContainerStyle"
> = {
  contentContainerStyle: styles.scrollContent,
};

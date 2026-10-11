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

/** Inbox owns its own GH ScrollView. Parent must be a bounded View, not a disabled ScrollView. */
export const notificationsInboxShellConfig: Pick<
  StackScreenShellProps,
  "contentContainerStyle" | "scrollEnabled"
> = {
  contentContainerStyle: styles.scrollContent,
  scrollEnabled: false,
};

/**
 * For screens whose body is a virtualized list (FlashList): the list is the scroll container,
 * so the shell must not wrap it in a second vertical ScrollView.
 */
export const stackVirtualizedListShellConfig: Pick<
  StackScreenShellProps,
  "scrollEnabled"
> = {
  scrollEnabled: false,
};

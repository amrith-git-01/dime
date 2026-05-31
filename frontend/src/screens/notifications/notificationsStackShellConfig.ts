import { StyleSheet } from "react-native";

import type { StackScreenShellProps } from "@/components/layout/StackScreenShell";

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
});

/** Lets notification empty states center in the scroll viewport. */
export const notificationsStackShellConfig: Pick<
  StackScreenShellProps,
  "contentContainerStyle"
> = {
  contentContainerStyle: styles.scrollContent,
};

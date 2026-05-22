import { colors } from "@/constants";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

export type TabScreenShellProps = {
  children: ReactNode;
};

export function TabScreenShell({ children }: TabScreenShellProps) {
  return (
    <View style={styles.root}>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "column",
    backgroundColor: colors.pageBackground,
  },
  content: {
    flex: 1,
    backgroundColor: colors.pageBackground,
  },
});

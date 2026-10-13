import type { ReactNode } from "react";
import { View } from "react-native";
import { createThemedStyles } from "@/theme";

export type TabScreenShellProps = {
  children: ReactNode;
};

export function TabScreenShell({ children }: TabScreenShellProps) {
  const styles = useStyles();
  return (
    <View style={styles.root}>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  root: {
    flex: 1,
    flexDirection: "column",
    backgroundColor: colors.paper,
  },
  content: {
    flex: 1,
    backgroundColor: colors.paper,
  },
}));

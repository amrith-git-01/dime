import { StyleSheet, View } from "react-native";

import { TabScreenShell } from "@/components/layout/TabScreenShell";

export default function NotificationsScreen() {
  return (
    <TabScreenShell>
      <View style={styles.body} />
    </TabScreenShell>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
});

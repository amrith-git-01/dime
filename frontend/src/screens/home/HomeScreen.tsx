import { memo } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { layout } from "@/constants";
import { HomeContent } from "@/features/home/components";
import { useHomeNativePermissionsPrompt } from "@/hooks/useHomeNativePermissionsPrompt";

import { useHomeScreenModel } from "./useHomeScreenModel";

export default memo(function HomeScreen() {
  useHomeNativePermissionsPrompt();
  const model = useHomeScreenModel();

  return (
    <TabScreenShell>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <HomeContent {...model} />
      </ScrollView>
    </TabScreenShell>
  );
});

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: layout.screenContent,
});

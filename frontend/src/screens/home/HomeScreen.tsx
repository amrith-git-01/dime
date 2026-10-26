import { memo, useRef } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { ARRANGE_SCREEN_BOTTOM_CLEARANCE, layout } from "@/constants";
import { HomeContent } from "@/features/home/components";
import { useTourScroller } from "@/hooks/useTourScroller";

import { useHomeScreenModel } from "./useHomeScreenModel";

export default memo(function HomeScreen() {
  const model = useHomeScreenModel();
  const scrollRef = useRef<ScrollView>(null);
  // Lets the guided tour scroll Home so each spotlighted section is in view.
  const { onScroll } = useTourScroller("home", (y, animated) =>
    scrollRef.current?.scrollTo({ y, animated }),
  );

  return (
    <TabScreenShell>
      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={32}
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
  content: {
    ...layout.screenContent,
    paddingBottom: ARRANGE_SCREEN_BOTTOM_CLEARANCE,
  },
});

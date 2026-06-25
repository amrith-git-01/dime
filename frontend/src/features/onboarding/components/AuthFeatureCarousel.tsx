import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ListRenderItem,
} from "react-native";

import {
  AUTH_FEATURE_SLIDES,
  type AuthFeatureSlideData,
} from "../constants/authFeatureSlides";
import { getWelcomeTourSlideLayout } from "../constants/onboardingTokens";
import { AuthFeatureSlide } from "./AuthFeatureSlide";

export interface AuthFeatureCarouselProps {
  activeIndex: number;
}

/** Horizontal slide pager — programmatic navigation only (no swipe). */
export function AuthFeatureCarousel({ activeIndex }: AuthFeatureCarouselProps) {
  const flatListRef = useRef<FlatList<AuthFeatureSlideData>>(null);
  const [pageWidth, setPageWidth] = useState(0);

  const layout = useMemo(
    () => (pageWidth > 0 ? getWelcomeTourSlideLayout(pageWidth) : null),
    [pageWidth],
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    if (nextWidth > 0) {
      setPageWidth(nextWidth);
    }
  }, []);

  useEffect(() => {
    if (pageWidth <= 0) {
      return;
    }
    flatListRef.current?.scrollToOffset({
      offset: activeIndex * pageWidth,
      animated: true,
    });
  }, [activeIndex, pageWidth]);

  const renderItem: ListRenderItem<AuthFeatureSlideData> = useCallback(
    ({ item }) => {
      if (!layout) {
        return null;
      }
      return (
        <View style={[styles.page, { width: pageWidth }]}>
          <AuthFeatureSlide slide={item} layout={layout} />
        </View>
      );
    },
    [layout, pageWidth],
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<AuthFeatureSlideData> | null | undefined, index: number) => ({
      length: pageWidth,
      offset: pageWidth * index,
      index,
    }),
    [pageWidth],
  );

  return (
    <View style={styles.root} onLayout={handleLayout}>
      {pageWidth > 0 && layout ? (
        <FlatList
          ref={flatListRef}
          data={AUTH_FEATURE_SLIDES}
          horizontal
          pagingEnabled
          scrollEnabled={false}
          bounces={false}
          nestedScrollEnabled={false}
          style={styles.list}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          initialScrollIndex={activeIndex}
          windowSize={3}
          maxToRenderPerBatch={2}
          removeClippedSubviews
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
  },
  list: {
    flex: 1,
  },
  page: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});

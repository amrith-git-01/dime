import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  FlatList,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewToken,
} from "react-native";

import {
  AUTH_FEATURE_SLIDES,
  type AuthFeatureSlideData,
} from "../constants/authFeatureSlides";
import { getAuthPostcardLayout } from "../constants/onboardingTokens";
import { AuthFeatureSlide } from "./AuthFeatureSlide";

const AUTO_ADVANCE_MS = 2500;
const SLIDE_COUNT = AUTH_FEATURE_SLIDES.length;

export interface AuthFeatureCarouselProps {
  onActiveIndexChange: (index: number) => void;
}

export function AuthFeatureCarousel({
  onActiveIndexChange,
}: AuthFeatureCarouselProps) {
  const { width: windowWidth } = useWindowDimensions();
  const pageWidth = windowWidth;
  const layout = useMemo(() => getAuthPostcardLayout(pageWidth), [pageWidth]);

  const flatListRef = useRef<FlatList<AuthFeatureSlideData>>(null);
  const currentIndexRef = useRef(0);
  const isUserScrollingRef = useRef(false);

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 60,
  }).current;

  // Sync active index from both auto-advance and manual swipe
  const onViewableItemsChanged = useCallback(
    ({
      viewableItems,
    }: {
      viewableItems: ViewToken<AuthFeatureSlideData>[];
    }) => {
      const index = viewableItems[0]?.index;
      if (index != null) {
        currentIndexRef.current = index;
        onActiveIndexChange(index);
      }
    },
    [onActiveIndexChange],
  );

  // Auto-advance every AUTO_ADVANCE_MS; pauses while user is dragging
  useEffect(() => {
    const interval = setInterval(() => {
      if (isUserScrollingRef.current) return;
      const next = (currentIndexRef.current + 1) % SLIDE_COUNT;
      flatListRef.current?.scrollToIndex({ index: next, animated: true });
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(interval);
  }, []);

  const handleScrollBeginDrag = useCallback(() => {
    isUserScrollingRef.current = true;
  }, []);

  const handleMomentumScrollEnd = useCallback(() => {
    isUserScrollingRef.current = false;
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: AuthFeatureSlideData }) => (
      <AuthFeatureSlide slide={item} pageWidth={pageWidth} layout={layout} />
    ),
    [layout, pageWidth],
  );

  const itemLayout = useMemo(
    () => (index: number) => ({
      length: pageWidth,
      offset: pageWidth * index,
      index,
    }),
    [pageWidth],
  );

  return (
    <View style={styles.root}>
      <FlatList
        ref={flatListRef}
        data={AUTH_FEATURE_SLIDES}
        horizontal
        pagingEnabled
        bounces={false}
        nestedScrollEnabled
        style={[styles.list, { height: layout.pageHeight }]}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => itemLayout(index)}
        onScrollBeginDrag={handleScrollBeginDrag}
        onMomentumScrollEnd={handleMomentumScrollEnd}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
  },
  list: {
    flexGrow: 0,
  },
});

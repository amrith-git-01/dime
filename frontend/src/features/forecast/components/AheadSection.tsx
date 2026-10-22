import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { BENTO_SECTION_GAP } from "@/components/bento";
import { ScreenSectionHeader, TourTarget } from "@/components/shared";
import { tourTargetIds } from "@/constants/tourTargetIds";

import type { ForecastActions, ForecastResponse } from "../types";
import { CategoriesAheadCard } from "./CategoriesAheadCard";
import { ComingUpCard } from "./ComingUpCard";
import { ForecastErrorCard } from "./ForecastErrorCard";
import { ForecastHeroCard } from "./ForecastHeroCard";
import {
  ComingUpSkeleton,
  ForecastHeroSkeleton,
  SafeToSpendSkeleton,
} from "./ForecastSkeletons";
import { SafeToSpendCard } from "./SafeToSpendCard";
import { WatchCard } from "./WatchCard";

type AheadSectionProps = {
  forecast: ForecastResponse | undefined;
  /** No forecast yet and one on its way. */
  loading: boolean;
  /** The forecast failed and there is none to show. */
  failed: boolean;
  onRetry: () => void;
  actions: ForecastActions;
};

/**
 * The Insights "Ahead" section (current month only): the forecast hero, safe to spend today,
 * Coming up, Watch and Categories ahead.
 */
export const AheadSection = memo(function AheadSection({
  forecast,
  loading,
  failed,
  onRetry,
  actions,
}: AheadSectionProps) {
  if (!forecast && !loading && !failed) {
    return null;
  }
  return (
    <View>
      <ScreenSectionHeader title="Ahead" />
      <View style={styles.cards}>
        {forecast ? (
          <>
            <TourTarget id={tourTargetIds.insightsForecast}>
              <ForecastHeroCard forecast={forecast} />
            </TourTarget>
            {forecast.safeToday ? (
              <SafeToSpendCard safeToday={forecast.safeToday} />
            ) : null}
            <TourTarget id={tourTargetIds.insightsComingUp}>
              <ComingUpCard
                upcoming={forecast.upcoming}
                today={forecast.today}
                actions={actions}
              />
            </TourTarget>
            {forecast.watch.length > 0 ? (
              <WatchCard watch={forecast.watch} actions={actions} />
            ) : null}
            {forecast.categories.length > 0 ? (
              <CategoriesAheadCard
                categories={forecast.categories}
                onCategoryPress={actions.onOpenCategory}
              />
            ) : null}
          </>
        ) : failed ? (
          <TourTarget id={tourTargetIds.insightsForecast}>
            <ForecastErrorCard onRetry={onRetry} />
          </TourTarget>
        ) : (
          <>
            <TourTarget id={tourTargetIds.insightsForecast}>
              <ForecastHeroSkeleton />
            </TourTarget>
            <SafeToSpendSkeleton />
            <TourTarget id={tourTargetIds.insightsComingUp}>
              <ComingUpSkeleton />
            </TourTarget>
          </>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  cards: {
    gap: BENTO_SECTION_GAP,
  },
});

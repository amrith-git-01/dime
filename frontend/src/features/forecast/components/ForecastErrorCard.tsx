import { memo } from "react";
import { Text, View } from "react-native";

import { Button } from "@/components/ui";
import { spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { InsightsCard } from "@/features/analytics/components/InsightsCard";
import { createThemedStyles } from "@/theme";

type ForecastErrorCardProps = {
  onRetry: () => void;
};

/** The forecast could not load: say so and offer another try. */
export const ForecastErrorCard = memo(function ForecastErrorCard({
  onRetry,
}: ForecastErrorCardProps) {
  const styles = useStyles();
  return (
    <InsightsCard kicker="MONTH FORECAST">
      <View style={styles.body}>
        <Text style={styles.message}>
          Couldn&apos;t load your forecast. Check your connection and try again.
        </Text>
        <Button
          title="Retry"
          variant="secondary"
          size="compact"
          onPress={onRetry}
        />
      </View>
    </InsightsCard>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  body: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
    alignItems: "flex-start",
  },
  message: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
}));

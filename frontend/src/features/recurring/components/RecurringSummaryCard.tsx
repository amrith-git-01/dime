import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  MonthSummaryHeaderKicker,
  MonthSummaryHeaderTitle,
  TwoToneCard,
} from "@/components/shared";
import { SkeletonBlock } from "@/components/ui";
import { fontFamilies, inkSoft, spacing } from "@/constants";
import { formatInrAmount } from "@/utils/currency";

export type RecurringSummaryCardProps = {
  kicker: string;
  /** Monthly total as a decimal string; undefined while loading. */
  monthlyTotal: string | undefined;
  detail: string;
  isLoading?: boolean;
};

/** Header of the income / subscriptions lists: the monthly total on the shared two-tone card. */
export const RecurringSummaryCard = memo(function RecurringSummaryCard({
  kicker,
  monthlyTotal,
  detail,
  isLoading = false,
}: RecurringSummaryCardProps) {
  return (
    <TwoToneCard
      header={
        <View style={styles.header}>
          <MonthSummaryHeaderKicker>{kicker}</MonthSummaryHeaderKicker>
          {isLoading || monthlyTotal === undefined ? (
            <SkeletonBlock style={styles.skeleton} />
          ) : (
            <MonthSummaryHeaderTitle>
              {formatInrAmount(monthlyTotal)}
            </MonthSummaryHeaderTitle>
          )}
        </View>
      }
      body={
        <View style={styles.body}>
          <Text style={styles.detail}>{detail}</Text>
        </View>
      }
    />
  );
});

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  skeleton: {
    marginTop: spacing.xs,
    height: 24,
    width: 140,
    borderRadius: 6,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  detail: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: inkSoft,
  },
});

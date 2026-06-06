import { memo } from "react";
import { StyleSheet, View } from "react-native";

import {
  BENTO_GAP,
  BENTO_TRANSACTION_TILE_MIN_HEIGHT,
} from "@/components/bento";
import { BentoSectionCardSegment, SkeletonListRow } from "@/components/shared";

const ROW_COUNT = 3;

/** Transaction list placeholders while the month/day query is loading. */
export const TransactionsListRowsSkeleton = memo(
  function TransactionsListRowsSkeleton() {
    return (
      <View style={styles.root}>
        {Array.from({ length: ROW_COUNT }, (_, index) => (
          <BentoSectionCardSegment
            key={index}
            isFirst={index === 0}
            isLast={index === ROW_COUNT - 1}
            showGapAfter={index < ROW_COUNT - 1}
          >
            <SkeletonListRow
              minHeight={BENTO_TRANSACTION_TILE_MIN_HEIGHT}
              iconSize={38}
              gap={BENTO_GAP}
            />
          </BentoSectionCardSegment>
        ))}
      </View>
    );
  },
);

/** @deprecated Use {@link TransactionsListRowsSkeleton}. */
export function TransactionsBentoSkeleton() {
  return <TransactionsListRowsSkeleton />;
}

const styles = StyleSheet.create({
  root: {
    gap: 0,
  },
});

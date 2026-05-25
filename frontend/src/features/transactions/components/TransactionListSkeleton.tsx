import { Fragment } from "react";

import { TransactionListRowSkeleton } from "./TransactionListRowSkeleton";

export type TransactionListSkeletonProps = {
  count?: number;
  variant?: "screen" | "card";
};

export function TransactionListSkeleton({
  count = 5,
  variant = "screen",
}: TransactionListSkeletonProps) {
  return (
    <Fragment>
      {Array.from({ length: count }).map((_, index) => (
        <TransactionListRowSkeleton
          key={`tx-skeleton-${index}`}
          variant={variant}
          showBottomBorder={
            variant === "card" ? index < count - 1 : true
          }
        />
      ))}
    </Fragment>
  );
}

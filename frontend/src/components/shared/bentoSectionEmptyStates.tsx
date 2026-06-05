import { ArrowLeftRight, LayoutGrid } from "lucide-react-native";
import { memo } from "react";

import { BentoQuickAddPills } from "./BentoQuickAddPills";
import { TwoToneEmptyState } from "./TwoToneEmptyState";
import { TwoToneEmptyStateInset } from "./TwoToneEmptyStateInset";

export type BentoSectionEmptyQuickAddProps = {
  onManualAdd: () => void;
  onReceipt: () => void;
  onVoice: () => void;
};

function quickAddFooter(props: BentoSectionEmptyQuickAddProps) {
  return (
    <BentoQuickAddPills
      onManualAdd={props.onManualAdd}
      onReceipt={props.onReceipt}
      onVoice={props.onVoice}
    />
  );
}

/** Home “Recent transactions” empty — full inline two-tone card. */
export const BentoRecentTransactionsEmptyState = memo(
  function BentoRecentTransactionsEmptyState(
    props: BentoSectionEmptyQuickAddProps,
  ) {
    return (
      <TwoToneEmptyState
        layout="inline"
        icon={ArrowLeftRight}
        title="No recent transactions"
        message="Transactions will appear here as you add them."
        footer={quickAddFooter(props)}
      />
    );
  },
);

/** Same copy/actions, nested inside a parent {@link TwoToneCard} body. */
export const BentoRecentTransactionsEmptyInset = memo(
  function BentoRecentTransactionsEmptyInset(
    props: BentoSectionEmptyQuickAddProps,
  ) {
    return (
      <TwoToneEmptyStateInset
        icon={ArrowLeftRight}
        title="No recent transactions"
        message="Transactions will appear here as you add them."
        footer={quickAddFooter(props)}
      />
    );
  },
);

/** Home “Top categories” empty — full inline two-tone card. */
export const BentoTopCategoriesEmptyState = memo(
  function BentoTopCategoriesEmptyState(props: BentoSectionEmptyQuickAddProps) {
    return (
      <TwoToneEmptyState
        layout="inline"
        icon={LayoutGrid}
        title="No spending yet this month"
        message="Your categories will appear here once you add transactions."
        footer={quickAddFooter(props)}
      />
    );
  },
);

/** Same copy/actions, nested inside a parent {@link TwoToneCard} body. */
export const BentoTopCategoriesEmptyInset = memo(
  function BentoTopCategoriesEmptyInset(props: BentoSectionEmptyQuickAddProps) {
    return (
      <TwoToneEmptyStateInset
        icon={LayoutGrid}
        title="No spending yet this month"
        message="Your categories will appear here once you add transactions."
        footer={quickAddFooter(props)}
      />
    );
  },
);

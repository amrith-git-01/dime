import { LayoutGrid } from "lucide-react-native";
import { memo } from "react";
import { View } from "react-native";

import type { CategorySpendRowData } from "@/components/categories/CategorySpendBentoRow";
import { CategorySpendList } from "@/components/categories/CategorySpendList";
import {
  BentoQuickAddPills,
  BentoSectionCard,
  TwoToneEmptyState,
} from "@/components/shared";

import { BentoSectionHeader } from "./BentoSectionHeader";

type HomeCategoriesBentoProps = {
  items: CategorySpendRowData[];
  hasMonthlyBudget: boolean;
  monthlyBudgetAmount: number;
  onViewAll: () => void;
  onManualAdd: () => void;
  onReceipt: () => void;
  onVoice: () => void;
};

/**
 * Top categories — same row layout as Budget "All categories".
 */
export const HomeCategoriesBento = memo(function HomeCategoriesBento({
  items,
  hasMonthlyBudget,
  monthlyBudgetAmount,
  onViewAll,
  onManualAdd,
  onReceipt,
  onVoice,
}: HomeCategoriesBentoProps) {
  const isEmpty = items.length === 0;

  return (
    <View>
      <BentoSectionHeader title="Top categories" onViewAll={onViewAll} />

      {isEmpty ? (
        <TwoToneEmptyState
          layout="inline"
          icon={LayoutGrid}
          title="No spending yet this month"
          message="Your categories will appear here once you add transactions."
          footer={
            <BentoQuickAddPills
              onManualAdd={onManualAdd}
              onReceipt={onReceipt}
              onVoice={onVoice}
            />
          }
        />
      ) : (
        <BentoSectionCard>
          <CategorySpendList
            items={items}
            hasMonthlyBudget={hasMonthlyBudget}
            monthlyBudgetAmount={monthlyBudgetAmount}
          />
        </BentoSectionCard>
      )}
    </View>
  );
});

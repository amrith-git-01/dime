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

import { BudgetCategoryRowsSkeleton } from "@/features/budgets/components";

import { BentoSectionHeader } from "./BentoSectionHeader";
import { HOME_MAX_CATEGORIES } from "./homeBentoTokens";

type HomeCategoriesBentoProps = {
  items: CategorySpendRowData[];
  hasMonthlyBudget: boolean;
  monthlyBudgetAmount: number;
  isLoading?: boolean;
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
  isLoading = false,
}: HomeCategoriesBentoProps) {
  const isEmpty = !isLoading && items.length === 0;

  return (
    <View>
      <BentoSectionHeader title="Top categories" onViewAll={onViewAll} />

      {isLoading ? (
        <BentoSectionCard>
          <BudgetCategoryRowsSkeleton rowCount={HOME_MAX_CATEGORIES} />
        </BentoSectionCard>
      ) : isEmpty ? (
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

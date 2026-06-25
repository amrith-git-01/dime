import { memo, useMemo } from "react";
import { View } from "react-native";

import {
  CategorySpendBentoRow,
  type CategorySpendRowData,
} from "@/components/categories/CategorySpendBentoRow";
import type { CustomCategoryIconName } from "@/features/categories/constants/customCategoryPresets";
import { parseBudgetAmount } from "@/features/categories/utils/parseBudgetAmount";

type CustomCategoryPreviewTileProps = {
  name: string;
  iconName: CustomCategoryIconName;
  color: string;
  monthlyBudget: string;
  hasMonthlyBudget: boolean;
  monthlyBudgetAmount: number;
  showBudgetSection?: boolean;
};

export const CustomCategoryPreviewTile = memo(
  function CustomCategoryPreviewTile({
    name,
    iconName,
    color,
    monthlyBudget,
    hasMonthlyBudget,
    monthlyBudgetAmount,
    showBudgetSection = true,
  }: CustomCategoryPreviewTileProps) {
    const previewItem = useMemo((): CategorySpendRowData => {
      const cap = showBudgetSection ? parseBudgetAmount(monthlyBudget) : null;
      return {
        id: "category-preview",
        name: name.trim().length > 0 ? name.trim() : "Name",
        icon_name: iconName,
        color,
        spentMonth: 0,
        is_system: false,
        monthlyCap: cap,
      };
    }, [color, iconName, monthlyBudget, name, showBudgetSection]);

    return (
      <View pointerEvents="none">
        <CategorySpendBentoRow
          item={previewItem}
          hasMonthlyBudget={showBudgetSection && hasMonthlyBudget}
          monthlyBudgetAmount={monthlyBudgetAmount}
        />
      </View>
    );
  },
);

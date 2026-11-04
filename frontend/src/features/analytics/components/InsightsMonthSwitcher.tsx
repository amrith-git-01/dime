import { memo } from "react";

import { MonthNavigator } from "@/components/shared/MonthNavigator";

export type InsightsMonthSwitcherProps = {
  selectedMonth: string;
  /** Label of the month the arrows lead to; named in the button labels when known. */
  prevMonthLabel?: string;
  nextMonthLabel?: string;
  canGoPrevMonth: boolean;
  canGoNextMonth: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
};

/** Month arrows at the top of Insights; every card below follows the month shown here. */
export const InsightsMonthSwitcher = memo(function InsightsMonthSwitcher({
  selectedMonth,
  prevMonthLabel,
  nextMonthLabel,
  canGoPrevMonth,
  canGoNextMonth,
  onPrevMonth,
  onNextMonth,
}: InsightsMonthSwitcherProps) {
  return (
    <MonthNavigator
      label={selectedMonth}
      prevLabel={prevMonthLabel}
      nextLabel={nextMonthLabel}
      canGoPrev={canGoPrevMonth}
      canGoNext={canGoNextMonth}
      onPrev={onPrevMonth}
      onNext={onNextMonth}
    />
  );
});

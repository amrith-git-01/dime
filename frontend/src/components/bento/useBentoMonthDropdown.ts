import { useCallback, useMemo } from "react";

import type { MonthOption } from "@/utils/buildMonthOptions";

export function useBentoMonthDropdown(
  monthOptions: MonthOption[],
  onSelectMonth: (index: number) => void,
) {
  const dropdownOptions = useMemo(
    () =>
      monthOptions.map((month) => ({
        label: month.label,
        value: month.label,
      })),
    [monthOptions],
  );

  const handleMonthChange = useCallback(
    (next: string) => {
      const index = monthOptions.findIndex((month) => month.label === next);
      if (index >= 0) {
        onSelectMonth(index);
      }
    },
    [monthOptions, onSelectMonth],
  );

  return { dropdownOptions, handleMonthChange };
}

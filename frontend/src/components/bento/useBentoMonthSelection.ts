import { useCallback, useMemo, useState } from "react";

import { buildMonthOptions } from "@/utils/buildMonthOptions";

import { BENTO_MONTH_OPTIONS_COUNT } from "./bentoMonthPickerTokens";

export function useBentoMonthSelection() {
  const monthOptions = useMemo(
    () => buildMonthOptions(BENTO_MONTH_OPTIONS_COUNT),
    [],
  );
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(0);
  const selectedMonth =
    monthOptions[selectedMonthIndex] ?? monthOptions[0];

  const selectMonth = useCallback((index: number) => {
    setSelectedMonthIndex(index);
  }, []);

  return {
    monthOptions,
    selectedMonth,
    selectedMonthIndex,
    selectMonth,
  };
}

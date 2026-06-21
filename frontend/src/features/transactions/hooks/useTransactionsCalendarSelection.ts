import { addDays, format, parseISO, subDays } from "date-fns";
import { useCallback, useMemo, useReducer } from "react";

import { TRANSACTIONS_MONTH_OPTIONS_COUNT } from "@/features/transactions/constants/transactionsCalendar";
import {
  buildMonthDayBounds,
  resolveDefaultDayKeyForMonth,
} from "@/features/transactions/utils/transactionsCalendar";
import { buildMonthOptions, type MonthOption } from "@/utils/buildMonthOptions";

type CalendarSelectionState = {
  monthIndex: number;
  dayKey: string;
};

type CalendarSelectionAction =
  | { type: "SELECT_DAY"; dayKey: string }
  | { type: "SELECT_MONTH"; monthIndex: number }
  | { type: "PREV_MONTH" }
  | { type: "NEXT_MONTH" }
  | { type: "PREV_DAY" }
  | { type: "NEXT_DAY" };

function createInitialState(
  monthOptions: MonthOption[],
): CalendarSelectionState {
  const month = monthOptions[0];
  return {
    monthIndex: 0,
    dayKey: resolveDefaultDayKeyForMonth(month.year, month.monthIndex0),
  };
}

function calendarSelectionReducer(
  state: CalendarSelectionState,
  action: CalendarSelectionAction,
  monthOptions: MonthOption[],
): CalendarSelectionState {
  const currentMonth = monthOptions[state.monthIndex] ?? monthOptions[0];

  switch (action.type) {
    case "SELECT_DAY":
      return { ...state, dayKey: action.dayKey };

    case "SELECT_MONTH": {
      const month = monthOptions[action.monthIndex];
      if (!month) return state;
      return {
        monthIndex: action.monthIndex,
        dayKey: resolveDefaultDayKeyForMonth(month.year, month.monthIndex0),
      };
    }

    case "PREV_MONTH": {
      const nextIndex = state.monthIndex + 1;
      if (nextIndex >= monthOptions.length) return state;
      const month = monthOptions[nextIndex];
      return {
        monthIndex: nextIndex,
        dayKey: resolveDefaultDayKeyForMonth(month.year, month.monthIndex0),
      };
    }

    case "NEXT_MONTH": {
      const nextIndex = state.monthIndex - 1;
      if (nextIndex < 0) return state;
      const month = monthOptions[nextIndex];
      return {
        monthIndex: nextIndex,
        dayKey: resolveDefaultDayKeyForMonth(month.year, month.monthIndex0),
      };
    }

    case "PREV_DAY": {
      const bounds = buildMonthDayBounds(
        currentMonth.year,
        currentMonth.monthIndex0,
      );
      if (state.dayKey <= bounds.startKey) return state;
      return {
        ...state,
        dayKey: format(
          subDays(parseISO(`${state.dayKey}T12:00:00`), 1),
          "yyyy-MM-dd",
        ),
      };
    }

    case "NEXT_DAY": {
      const bounds = buildMonthDayBounds(
        currentMonth.year,
        currentMonth.monthIndex0,
      );
      if (state.dayKey >= bounds.endKey) return state;
      return {
        ...state,
        dayKey: format(
          addDays(parseISO(`${state.dayKey}T12:00:00`), 1),
          "yyyy-MM-dd",
        ),
      };
    }

    default:
      return state;
  }
}

/**
 * Keeps month index and selected day in one reducer so month navigation
 * always resets the day synchronously (no post-paint useEffect).
 */
export function useTransactionsCalendarSelection() {
  const monthOptions = useMemo(
    () => buildMonthOptions(TRANSACTIONS_MONTH_OPTIONS_COUNT),
    [],
  );

  const reducer = useCallback(
    (state: CalendarSelectionState, action: CalendarSelectionAction) =>
      calendarSelectionReducer(state, action, monthOptions),
    [monthOptions],
  );

  const [state, dispatch] = useReducer(
    reducer,
    monthOptions,
    createInitialState,
  );

  const selectedMonth = monthOptions[state.monthIndex] ?? monthOptions[0];
  const monthDayBounds = useMemo(
    () => buildMonthDayBounds(selectedMonth.year, selectedMonth.monthIndex0),
    [selectedMonth.year, selectedMonth.monthIndex0],
  );

  const canGoPrevMonth = state.monthIndex < monthOptions.length - 1;
  const canGoNextMonth = state.monthIndex > 0;
  const canGoPrevDay = state.dayKey > monthDayBounds.startKey;
  const canGoNextDay = state.dayKey < monthDayBounds.endKey;

  const selectDay = useCallback((dayKey: string) => {
    dispatch({ type: "SELECT_DAY", dayKey });
  }, []);

  const selectMonth = useCallback((monthIndex: number) => {
    dispatch({ type: "SELECT_MONTH", monthIndex });
  }, []);

  const goPrevMonth = useCallback(() => {
    dispatch({ type: "PREV_MONTH" });
  }, []);

  const goNextMonth = useCallback(() => {
    dispatch({ type: "NEXT_MONTH" });
  }, []);

  const goPrevDay = useCallback(() => {
    dispatch({ type: "PREV_DAY" });
  }, []);

  const goNextDay = useCallback(() => {
    dispatch({ type: "NEXT_DAY" });
  }, []);

  return {
    canGoNextDay,
    canGoNextMonth,
    canGoPrevDay,
    canGoPrevMonth,
    goNextDay,
    goNextMonth,
    goPrevDay,
    goPrevMonth,
    monthDayBounds,
    monthOptions,
    selectDay,
    selectMonth,
    selectedDayKey: state.dayKey,
    selectedMonth,
    selectedMonthIndex: state.monthIndex,
  };
}

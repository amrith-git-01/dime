import {
  useCallback,
  useEffect,
  useState,
  type MutableRefObject,
} from "react";

export type InsightsCashflowDaySelection = {
  day: number;
  date: string;
  expense: number;
  income: number;
  net: number;
};

/** Window-space rectangle of the tapped day cell (same shape the tooltip overlay anchors to). */
export type CashflowDayAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SelectedCashflowDay = {
  selection: InsightsCashflowDaySelection;
  anchorWindow: CashflowDayAnchor;
};

function toDaySelection(
  row: InsightsCashflowDaySelection,
): InsightsCashflowDaySelection {
  return {
    day: row.day,
    date: row.date,
    expense: row.expense,
    income: row.income,
    net: row.net,
  };
}

type UseCashflowDayTooltipArgs = {
  /** Parent scroll views can call this ref to dismiss an open day tooltip. */
  tooltipDismissRef?: MutableRefObject<(() => void) | null>;
  /** Fired when the user taps View in the day tooltip. */
  onViewDayPress?: (day: InsightsCashflowDaySelection) => void;
};

/** Selected-day state for the daily cash-flow chart tooltip. */
export function useCashflowDayTooltip({
  tooltipDismissRef,
  onViewDayPress,
}: UseCashflowDayTooltipArgs) {
  const [selected, setSelected] = useState<SelectedCashflowDay | null>(null);

  const dismissTooltip = useCallback(() => {
    setSelected(null);
  }, []);

  useEffect(() => {
    if (!tooltipDismissRef) {
      return;
    }
    tooltipDismissRef.current = dismissTooltip;
    return () => {
      tooltipDismissRef.current = null;
    };
  }, [dismissTooltip, tooltipDismissRef]);

  const handleDayPress = useCallback(
    (row: InsightsCashflowDaySelection, anchorWindow: CashflowDayAnchor) => {
      const next = toDaySelection(row);
      setSelected((prev) =>
        prev?.selection.day === next.day
          ? null
          : { selection: next, anchorWindow },
      );
    },
    [],
  );

  const handleViewPress = useCallback(() => {
    const day = selected?.selection;
    if (!day) {
      return;
    }
    dismissTooltip();
    onViewDayPress?.(day);
  }, [dismissTooltip, onViewDayPress, selected]);

  return {
    selected,
    selectedDay: selected?.selection.day ?? null,
    dismissTooltip,
    handleDayPress,
    handleViewPress,
  };
}

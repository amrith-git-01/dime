import { format, parseISO } from "date-fns";
import { useMemo } from "react";

import { ChartTooltipOverlay, netTone } from "@/components/shared";
import { formatInrCompact } from "@/utils/currency";

import type { SelectedCashflowDay } from "../hooks/useCashflowDayTooltip";

type CashflowDayTooltipProps = {
  selected: SelectedCashflowDay | null;
  todayDay: number | null;
  onDismiss: () => void;
  onViewPress: () => void;
};

function tooltipTitle(selected: SelectedCashflowDay, todayDay: number | null) {
  const { day, date } = selected.selection;
  if (todayDay != null && day === todayDay) {
    return "Today";
  }
  return format(parseISO(date), "d MMM");
}

/** Expense / income / net breakdown for the tapped day of the cash-flow chart. */
export function CashflowDayTooltip({
  selected,
  todayDay,
  onDismiss,
  onViewPress,
}: CashflowDayTooltipProps) {
  const rows = useMemo(() => {
    if (!selected) {
      return [];
    }
    const { expense, income, net } = selected.selection;
    return [
      {
        label: "Expense",
        value: formatInrCompact(expense),
        tone: "debit" as const,
      },
      {
        label: "Income",
        value: formatInrCompact(income),
        tone: "credit" as const,
      },
      {
        label: "Net",
        value: formatInrCompact(net),
        tone: netTone(net),
      },
    ];
  }, [selected]);

  const viewAction = useMemo(
    () => ({ label: "View day", onPress: onViewPress }),
    [onViewPress],
  );

  return (
    <ChartTooltipOverlay
      visible={selected != null}
      onDismiss={onDismiss}
      title={selected ? tooltipTitle(selected, todayDay) : ""}
      rows={rows}
      anchor={selected?.anchorWindow ?? null}
      viewAction={viewAction}
    />
  );
}

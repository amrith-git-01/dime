import { COUNTERPARTY_DONUT_SLICE_COLORS } from "@/features/analytics/constants/counterpartyDonutColors";
import type { CounterpartyDonutDatum } from "@/features/analytics/utils/buildCounterpartyDonutData";

export type AgentDonutSeriesItem = {
  name: string;
  value: number;
};

export function buildAgentDonutData(
  series: AgentDonutSeriesItem[],
): CounterpartyDonutDatum[] {
  const cleaned = series.filter(
    (item) =>
      item.name.trim().length > 0 &&
      Number.isFinite(item.value) &&
      item.value > 0,
  );
  const total = cleaned.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) {
    return [];
  }

  return cleaned.map((item, index) => ({
    label: item.name.trim(),
    value: item.value,
    color:
      COUNTERPARTY_DONUT_SLICE_COLORS[
        index % COUNTERPARTY_DONUT_SLICE_COLORS.length
      ],
    payee_key: `agent-slice-${index}`,
    display_name: item.name.trim(),
    share: item.value / total,
    debit_total: item.value,
    transaction_count: 0,
  }));
}

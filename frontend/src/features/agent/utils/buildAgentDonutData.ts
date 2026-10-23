import type {
  CounterpartyDonutDatum,
  DonutColors,
} from "@/features/analytics/utils/buildCounterpartyDonutData";

export type AgentDonutSeriesItem = {
  name: string;
  value: number;
};

export function buildAgentDonutData(
  series: AgentDonutSeriesItem[],
  donutColors: DonutColors,
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
    color: donutColors.slices[index % donutColors.slices.length],
    payee_key: `agent-slice-${index}`,
    display_name: item.name.trim(),
    share: item.value / total,
    amount: item.value,
    transaction_count: 0,
  }));
}

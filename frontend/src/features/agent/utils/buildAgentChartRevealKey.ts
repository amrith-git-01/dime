import type { AgentBlockMiniChart } from "../types";

export function buildAgentChartRevealKey(block: AgentBlockMiniChart): string {
  const title =
    typeof block.payload.title === "string" ? block.payload.title : "";

  if (block.chart_kind === "donut") {
    const series = block.payload.series ?? [];
    const parts = series
      .map((item) => {
        if (!item || typeof item !== "object") {
          return "";
        }
        const record = item as Record<string, unknown>;
        return `${String(record.name ?? "")}:${String(record.value ?? "")}`;
      })
      .filter(Boolean);
    return `donut|${title}|${parts.join(";")}`;
  }

  const points = block.payload.points ?? [];
  const first = points[0] as { date?: string } | undefined;
  const last = points[points.length - 1] as { date?: string } | undefined;
  return `cashflow|${title}|${points.length}|${first?.date ?? ""}|${last?.date ?? ""}`;
}

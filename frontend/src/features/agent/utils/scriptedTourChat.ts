import { startOfDay } from "date-fns";

import { buildSampleSet, type TourSampleSet } from "@/features/tourPreview";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import type { AgentChatResponse } from "../types";

/** The question the Ask AI tour's sample exchange answers (one of the suggested prompts). */
export const SCRIPTED_TOUR_QUESTION = "How much did I spend on food this month?";

/** Progress lines shown while the scripted answer "thinks", then how long until it lands (ms). */
export const SCRIPTED_TOUR_STEPS: readonly { label: string; atMs: number }[] = [
  { label: "Reading your transactions", atMs: 0 },
  { label: "Adding it up", atMs: 500 },
];
export const SCRIPTED_TOUR_ANSWER_MS = 1100;

const FOOD_CATEGORY = "Food & Dining";
const SPLIT_CATEGORIES = [
  { name: "Food", category: FOOD_CATEGORY },
  { name: "Shopping", category: "Shopping" },
  { name: "Transport", category: "Transport" },
] as const;

const rupees = (amount: number): string =>
  `₹${new Intl.NumberFormat("en-IN").format(Math.round(amount))}`;

/** Spend per category name of a sample month, in rupees (the same numbers the Home and Budgets screens show). */
function spendByCategory(month: TourSampleSet["current"]): Map<string, number> {
  const names = new Map(
    (month.monthSummary.category_meta ?? []).map((meta) => [meta.id, meta.name]),
  );
  const totals = new Map<string, number>();
  for (const [id, amount] of Object.entries(month.monthSummary.debit_by_category)) {
    const name = names.get(id) ?? id;
    totals.set(name, (totals.get(name) ?? 0) + Number.parseFloat(amount));
  }
  return totals;
}

/**
 * The sample answer the Ask AI tour shows, worked out from the same sample months the tour's
 * screens show (one source for every figure): this month's food spend, how it compares with last
 * month's, and a donut of where the whole month went. Pure data: it never reaches the model, so it
 * costs nothing and counts toward no daily limit.
 */
export function buildScriptedTourAnswer(set: TourSampleSet): AgentChatResponse {
  const thisMonth = spendByCategory(set.current);
  const lastMonth = spendByCategory(set.previous);
  const food = thisMonth.get(FOOD_CATEGORY) ?? 0;
  const lastFood = lastMonth.get(FOOD_CATEGORY) ?? 0;
  const total = Number.parseFloat(set.current.monthSummary.debit_total);

  const percent = lastFood > 0 ? Math.round((Math.abs(food - lastFood) / lastFood) * 100) : 0;
  const comparison =
    percent === 0 ? "" : `, about ${percent}% ${food < lastFood ? "less" : "more"} than last month`;

  const split = SPLIT_CATEGORIES.map(({ name, category }) => ({
    name,
    value: thisMonth.get(category) ?? 0,
  }));
  const other = Math.max(0, total - split.reduce((sum, item) => sum + item.value, 0));

  return {
    answer: `You spent ${rupees(food)} on food this month${comparison}. Here is where the ${rupees(total)} went.`,
    blocks: [
      {
        type: "mini_chart",
        chart_kind: "donut",
        payload: {
          title: "Where this month went",
          series: [...split, { name: "Other", value: other }].map((item) => ({
            ...item,
            value: Math.round(item.value),
          })),
        },
      },
    ],
    deep_link: null,
    memory: null,
    turn_id: null,
  };
}

/** The scripted answer for today, from the same sample the screens use. */
export function buildScriptedTourAnswerForToday(): AgentChatResponse {
  const now = new Date();
  return buildScriptedTourAnswer(
    buildSampleSet({
      today: startOfDay(now),
      now,
      timezone: getDeviceIanaTimezone(),
    }),
  );
}

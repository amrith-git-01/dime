/**
 * The one October the reel tells, in rupees. Every scene imports its numbers and payees from here,
 * so the month total, the budget card, the donut and the chat answer always agree. Pure data.
 */

export type ReelCategoryKey = "food" | "shopping" | "transport";

export type ReelPayee = {
  title: string;
  category: ReelCategoryKey;
  amount: number;
};

/** The transactions the list grows by, scene by scene (Voice, Receipt, Quick add). */
export const REEL_PAYEES = {
  swiggy: { title: "Swiggy", category: "food", amount: 250 },
  rapido: { title: "Rapido", category: "transport", amount: 45 },
  zepto: { title: "Zepto", category: "shopping", amount: 860 },
  smoor: { title: "Smoor", category: "food", amount: 480 },
  chai: { title: "Chai", category: "food", amount: 120 },
} as const satisfies Record<string, ReelPayee>;

/** The month total before Quick add's entry, and after it (what Budget then shows as spent). */
export const MONTH_TOTAL_BEFORE_QUICK_ADD = 18500;
export const MONTH_TOTAL = MONTH_TOTAL_BEFORE_QUICK_ADD + REEL_PAYEES.chai.amount;

export const MONTH_BUDGET = 30000;
export const MONTH_RECURRING = 2400;

/** Where the month's money went (sums to MONTH_TOTAL); the donut derives its shares from it. */
export const CATEGORY_SPEND = {
  food: 7076,
  shopping: 5030,
  transport: 3540,
  other: 2974,
} as const;

import { fetchBudget } from "@/features/budgets/api/budgetsApi";
import { fetchCategoryBudgets } from "@/features/budgets/api/categoryBudgetsApi";
import { fetchHomeOverview } from "@/features/transactions/api/transactionsApi";
import { getSession } from "@/lib/auth/session";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import { buildWidgetSnapshotFromData } from "./buildWidgetSnapshot";
import { writeWidgetSnapshot } from "./widgetSnapshotMmkv";

/**
 * Fetches the home overview and budgets straight from the API and stores them as the widget
 * snapshot, for when the app's own cache is not running (the capture card, the widget's headless
 * task). Returns whether the stored snapshot changed; the caller redraws the widget when it did.
 * Rejects on a network or auth error, and writes nothing for a session that is not `userId`.
 */
export async function refreshWidgetSnapshotFromApi(userId: string): Promise<boolean> {
  if (getSession()?.user.id !== userId) {
    return false;
  }
  const [overview, budget, categoryBudgets] = await Promise.all([
    fetchHomeOverview(getDeviceIanaTimezone()),
    fetchBudget(),
    fetchCategoryBudgets(),
  ]);
  // Signed out (or switched) while the requests were in flight.
  if (getSession()?.user.id !== userId) {
    return false;
  }
  return writeWidgetSnapshot(
    buildWidgetSnapshotFromData({
      userId,
      updatedAt: Date.now(),
      overview,
      monthlyBudget: budget.budget?.monthly_budget,
      categoryBudgets,
    }),
  );
}

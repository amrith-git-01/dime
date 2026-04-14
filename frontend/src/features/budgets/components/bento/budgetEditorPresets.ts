/** Preset checkpoints + custom for budget limit sliders. */

export const MONTHLY_BUDGET_PRESETS = [15_000, 20_000, 30_000, 40_000] as const;

export const DAILY_BUDGET_PRESETS = [500, 1_000, 1_500, 2_000] as const;

/** No cap selected — thumb at start, no checkpoint highlighted. */
export const BUDGET_UNSET_STEP_INDEX = -1;

export const BUDGET_CUSTOM_STEP_INDEX = MONTHLY_BUDGET_PRESETS.length;

export const BUDGET_STEP_LAST_INDEX = BUDGET_CUSTOM_STEP_INDEX;

export type BudgetPresetList =
  | typeof MONTHLY_BUDGET_PRESETS
  | typeof DAILY_BUDGET_PRESETS;

export function getBudgetCheckpointLabels(
  presets: readonly number[],
): string[] {
  return [
    ...presets.map((amount) => formatPresetCheckpointLabel(amount)),
    "Custom",
  ];
}

export function formatPresetCheckpointLabel(amount: number): string {
  if (amount >= 1000) {
    const k = amount / 1000;
    return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1)}k`;
  }
  return String(amount);
}

export function findPresetStepIndex(
  amount: number,
  presets: readonly number[],
): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    return BUDGET_UNSET_STEP_INDEX;
  }
  const match = presets.findIndex((preset) => Math.abs(preset - amount) < 0.5);
  if (match >= 0) {
    return match;
  }
  return BUDGET_CUSTOM_STEP_INDEX;
}

export function presetAmountForStep(
  stepIndex: number,
  presets: readonly number[],
): number | null {
  if (stepIndex === BUDGET_UNSET_STEP_INDEX) {
    return 0;
  }
  if (stepIndex === BUDGET_CUSTOM_STEP_INDEX) {
    return null;
  }
  return presets[stepIndex] ?? null;
}

/** Maps unset (-1) to leftmost thumb position (before first preset). */
export function sliderThumbStepIndex(stepIndex: number): number {
  return stepIndex < 0 ? 0 : stepIndex;
}

export function formatBudgetAmountText(amount: number): string {
  return String(Math.round(amount));
}

export function parsePositiveBudgetAmount(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

/** Unset → 0; preset/custom → positive amount or null if invalid. */
export function resolveBudgetAmountForSave(
  stepIndex: number,
  valueText: string,
): number | null {
  if (stepIndex === BUDGET_UNSET_STEP_INDEX) {
    return 0;
  }
  return parsePositiveBudgetAmount(valueText);
}

/** Warn % presets for budget alert config (mirrors budget limits slider pattern). */

export const WARN_PCT_PRESETS = [50, 70, 80, 90] as const;

export const WARN_PCT_MIN = 50;
export const WARN_PCT_MAX = 95;
export const WARN_PCT_CUSTOM_STEP_INDEX = WARN_PCT_PRESETS.length;

export function clampWarnPct(value: number): number {
  if (!Number.isFinite(value)) {
    return 80;
  }
  return Math.max(WARN_PCT_MIN, Math.min(WARN_PCT_MAX, Math.round(value)));
}

export function warnPctStepIndex(pct: number): number {
  const clamped = clampWarnPct(pct);
  const presetIndex = WARN_PCT_PRESETS.indexOf(
    clamped as (typeof WARN_PCT_PRESETS)[number],
  );
  return presetIndex >= 0 ? presetIndex : WARN_PCT_CUSTOM_STEP_INDEX;
}

export function warnPctFromStep(stepIndex: number, customPct: number): number {
  if (stepIndex === WARN_PCT_CUSTOM_STEP_INDEX) {
    return clampWarnPct(customPct);
  }
  return WARN_PCT_PRESETS[stepIndex] ?? 80;
}

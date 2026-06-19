import type {
  CashflowChartRowY,
  CashflowVictoryChartRow,
} from "./buildCashflowWindow";

/** Readable INR ceilings for daily spend / income tiers. */
const INR_NICE_STEPS = [
  100, 200, 500, 750, 1_000, 1_500, 2_000, 3_000, 5_000, 7_500, 10_000, 15_000,
  20_000, 25_000, 30_000, 50_000, 75_000, 100_000, 200_000, 500_000,
] as const;

const MAX_Y_BREAKS = 5;

export function snapNiceInrCeiling(amount: number): number {
  if (amount <= 0) {
    return INR_NICE_STEPS[0];
  }
  for (const step of INR_NICE_STEPS) {
    if (step >= amount) {
      return step;
    }
  }
  const magnitude = 10 ** Math.ceil(Math.log10(amount));
  return Math.ceil(amount / magnitude) * magnitude;
}

/**
 * Y-axis breakpoints from spend clusters (quantiles), snapped to INR tiers.
 * Each adjacent pair forms one equal-height chart segment.
 */
export function buildClusterYBreaks(values: number[]): number[] {
  const positive = [...new Set(values.filter((v) => v > 0))].sort(
    (a, b) => a - b,
  );

  if (positive.length === 0) {
    return [0, 1_000];
  }

  const rawMax = positive[positive.length - 1];
  const top = snapNiceInrCeiling(rawMax);

  if (positive.length === 1) {
    return [0, top];
  }

  const quantiles = [0.33, 0.66, 1];
  const breaks: number[] = [0];

  for (const q of quantiles) {
    const idx = Math.min(
      positive.length - 1,
      Math.max(0, Math.floor(q * (positive.length - 1))),
    );
    const snapped = snapNiceInrCeiling(positive[idx]);
    const last = breaks[breaks.length - 1];
    if (snapped > last * 1.12) {
      breaks.push(snapped);
    }
  }

  if (breaks[breaks.length - 1] < top) {
    breaks.push(top);
  } else {
    breaks[breaks.length - 1] = top;
  }

  if (breaks.length === 2 && top >= breaks[1] * 2) {
    const midRaw = positive[Math.floor(positive.length / 2)];
    const mid = snapNiceInrCeiling(midRaw);
    if (mid > breaks[1] && mid < top) {
      breaks.splice(1, 0, mid);
    }
  }

  while (breaks.length > MAX_Y_BREAKS) {
    const middleIndex = Math.floor((breaks.length - 1) / 2);
    breaks.splice(middleIndex, 1);
  }

  return breaks;
}

/** Map a rupee amount into piecewise-linear scale space (0 … segmentCount). */
export function toPiecewiseScaleValue(value: number, breaks: number[]): number {
  if (value <= 0 || breaks.length < 2) {
    return 0;
  }

  const segmentCount = breaks.length - 1;
  const top = breaks[breaks.length - 1];

  if (value >= top) {
    return segmentCount;
  }

  for (let i = 1; i < breaks.length; i += 1) {
    const low = breaks[i - 1];
    const high = breaks[i];
    if (value <= high) {
      const progress = high === low ? 1 : (value - low) / (high - low);
      return i - 1 + progress;
    }
  }

  return segmentCount;
}

export type ClusteredCashflowScale = {
  breaks: number[];
  /** Victory y-domain max (one unit per segment). */
  yDomainMax: number;
  /** INR labels shown on the y-axis (same order as breaks). */
  yTickLabels: number[];
  rawMax: number;
  toScaleValue: (amount: number) => number;
};

export function buildClusteredCashflowScale(
  values: number[],
): ClusteredCashflowScale {
  const breaks = buildClusterYBreaks(values);
  const yDomainMax = Math.max(1, breaks.length - 1);
  const rawMax = values.length > 0 ? Math.max(0, ...values) : 0;

  return {
    breaks,
    yDomainMax,
    yTickLabels: breaks,
    rawMax,
    toScaleValue: (amount) => toPiecewiseScaleValue(amount, breaks),
  };
}

export function scaleCashflowVictoryRow(
  row: CashflowVictoryChartRow,
  scale: ClusteredCashflowScale,
): CashflowVictoryChartRow {
  return {
    ...row,
    expense: scale.toScaleValue(row.expense),
    income: scale.toScaleValue(row.income),
    netSurplus: scale.toScaleValue(row.netSurplus),
    netDeficit: scale.toScaleValue(row.netDeficit),
  };
}

export function collectCashflowRowValues(
  rows: Array<{ day: number } & CashflowChartRowY>,
): number[] {
  const values: number[] = [];
  for (const row of rows) {
    values.push(row.expense, row.income, row.netSurplus, row.netDeficit);
  }
  return values;
}

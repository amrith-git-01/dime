type CashflowChartNumericRow = {
  expense: number;
  income: number;
  netSurplus: number;
  netDeficit: number;
};

export function zeroCashflowChartRows<T extends CashflowChartNumericRow>(
  rows: T[],
): T[] {
  return rows.map((row) => ({
    ...row,
    expense: 0,
    income: 0,
    netSurplus: 0,
    netDeficit: 0,
  }));
}

import {
  COUNTERPARTY_DONUT_OTHER_COLOR,
  COUNTERPARTY_DONUT_OTHER_KEY,
  COUNTERPARTY_DONUT_SLICE_COLORS,
} from "../constants/counterpartyDonutColors";
import type { CounterpartySpendRow } from "../types";

export type CounterpartyDonutDatum = {
  label: string;
  value: number;
  color: string;
  payee_key: string;
  display_name: string;
  share: number;
  debit_total: number;
  transaction_count: number;
};

function sliceColorForRow(
  row: CounterpartySpendRow,
  topPayeeColorIndex: number,
): string {
  if (row.payee_key === COUNTERPARTY_DONUT_OTHER_KEY) {
    return COUNTERPARTY_DONUT_OTHER_COLOR;
  }
  return COUNTERPARTY_DONUT_SLICE_COLORS[
    topPayeeColorIndex % COUNTERPARTY_DONUT_SLICE_COLORS.length
  ];
}

export function buildCounterpartyDonutData(
  rows: CounterpartySpendRow[],
): CounterpartyDonutDatum[] {
  let topPayeeColorIndex = 0;
  const result: CounterpartyDonutDatum[] = [];

  for (const row of rows) {
    const value = Number.parseFloat(row.debit_total);
    if (!Number.isFinite(value) || value <= 0) {
      continue;
    }
    const isOther = row.payee_key === COUNTERPARTY_DONUT_OTHER_KEY;
    result.push({
      label: row.display_name,
      value,
      color: sliceColorForRow(row, topPayeeColorIndex),
      payee_key: row.payee_key,
      display_name: row.display_name,
      share: row.share,
      debit_total: value,
      transaction_count: row.transaction_count,
    });
    if (!isOther) {
      topPayeeColorIndex += 1;
    }
  }

  return result;
}

/** Payee keys for top slices (excludes `__other__`). */
export function topPayeeKeysFromSpend(rows: CounterpartySpendRow[]): string[] {
  return rows
    .filter((row) => row.payee_key !== COUNTERPARTY_DONUT_OTHER_KEY)
    .map((row) => row.payee_key);
}

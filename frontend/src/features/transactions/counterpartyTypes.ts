export const COUNTERPARTY_TYPES = [
  "merchant",
  "person",
  "self_transfer",
  "unknown",
] as const;

export type CounterpartyType = (typeof COUNTERPARTY_TYPES)[number];

const COUNTERPARTY_LABELS: Record<CounterpartyType, string> = {
  merchant: "Shop or business",
  person: "Person",
  self_transfer: "Self transfer",
  unknown: "Unknown",
};

export type CounterpartyTypeOption = {
  value: CounterpartyType;
  label: string;
};

export const COUNTERPARTY_TYPE_OPTIONS = COUNTERPARTY_TYPES.map((value) => ({
  value,
  label: COUNTERPARTY_LABELS[value],
})) as readonly CounterpartyTypeOption[];

export const DEFAULT_COUNTERPARTY_TYPE: CounterpartyType = "merchant";

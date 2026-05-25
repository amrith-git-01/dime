import type { SelectDropdownOption } from "@/components/ui/SelectDropdown/SelectDropdown";

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

export const COUNTERPARTY_TYPE_OPTIONS = COUNTERPARTY_TYPES.map((value) => ({
  value,
  label: COUNTERPARTY_LABELS[value],
})) as readonly SelectDropdownOption<CounterpartyType>[];

export const DEFAULT_COUNTERPARTY_TYPE: CounterpartyType = "merchant";

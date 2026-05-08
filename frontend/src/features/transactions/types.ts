export type TransactionType = "debit" | "credit";

export type TransactionRow = {
  id: string;
  user_id: string;
  amount: string;
  type: TransactionType;
  merchant: string;
  category: string | null;
  note: string | null;
  detected_via: string | null;
  transaction_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  receipt_url: string | null;
  voice_url: string | null;
};

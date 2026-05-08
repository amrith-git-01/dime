import { dimeApi } from "@/lib/api/dimeApi";

import type { CreateTransactionBody } from "./transactionsApi";

type CloudReceiptParseResponse = {
  merchant: string;
  amount: number;
  type: "debit" | "credit";
  category: string | null;
  note: string | null;
  transaction_at: string;
};

export async function parseReceiptPhotoWithCloud(
  imageUri: string,
): Promise<CreateTransactionBody> {
  const form = new FormData();
  form.append("file", {
    uri: imageUri,
    name: "receipt.jpg",
    type: "image/jpeg",
  } as unknown as Blob);

  const { data } = await dimeApi.post<CloudReceiptParseResponse>(
    "/api/v1/ai/receipt-parse",
    form,
  );

  return {
    amount: data.amount,
    type: data.type,
    merchant: data.merchant,
    category: data.category,
    note: data.note,
    transaction_at: data.transaction_at,
    detected_via: "receipt_cloud",
  };
}

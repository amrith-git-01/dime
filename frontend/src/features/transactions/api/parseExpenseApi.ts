import { dimeApi } from "@/lib/api/dimeApi";

export type ParseMode = "sms" | "receipt" | "voice";

export type ParseExpenseResult = {
  counterparty_name: string;
  counterparty_type: "merchant" | "person" | "self_transfer" | "unknown";
  amount: string | number;
  type: "debit" | "credit";
  date: string | null;
  category: string;
  note: string | null;
  confidence: number;
  raw_model: string;
};

export type ParseExpenseResponse = {
  mode: ParseMode;
  result: ParseExpenseResult;
};

export async function parseExpenseFile(input: {
  mode: "receipt" | "voice";
  fileUri: string;
  fileName: string;
  mimeType: string;
}): Promise<ParseExpenseResponse> {
  const form = new FormData();
  form.append("mode", input.mode);
  form.append("file", {
    uri: input.fileUri,
    name: input.fileName,
    type: input.mimeType,
  } as unknown as Blob);
  const { data } = await dimeApi.post<ParseExpenseResponse>(
    "/api/v1/ai/parse-expense",
    form,
  );
  return data;
}
export async function parseExpenseText(input: {
  mode: "sms";
  text: string;
}): Promise<ParseExpenseResponse> {
  const form = new FormData();
  form.append("mode", input.mode);
  form.append("text", input.text);
  const { data } = await dimeApi.post<ParseExpenseResponse>(
    "/api/v1/ai/parse-expense",
    form,
  );
  return data;
}

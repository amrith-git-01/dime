declare module "expo-transaction-sms-reader" {
  export function ensurePermissionsAsync(): Promise<string>;
  export function getRecentMessages(options?: {
    limit?: number;
    sinceTimestamp?: number;
    onlyTransactions?: boolean;
    senderAllowlist?: string[];
    minConfidence?: number;
  }): Promise<
    {
      raw?: {
        id?: string | number;
        address?: string;
        body?: string;
        date?: number;
      };
    }[]
  >;
}

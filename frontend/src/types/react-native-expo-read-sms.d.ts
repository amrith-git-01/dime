declare module "@maniac-tech/react-native-expo-read-sms" {
  export type SmsPermissionCheck = {
    hasReceiveSmsPermission: boolean;
    hasReadSmsPermission: boolean;
  };

  export type ReadSmsStatus = "success" | "error";

  export function startReadSMS(
    callback: (status: ReadSmsStatus, sms: string, error?: string) => void,
  ): Promise<void>;

  export function stopReadSMS(): void;

  export function checkIfHasSMSPermission(): Promise<SmsPermissionCheck>;

  export function requestReadSMSPermission(): Promise<boolean>;
}

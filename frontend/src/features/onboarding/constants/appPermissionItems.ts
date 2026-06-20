export type AppPermissionId =
  | "sms"
  | "notifications"
  | "camera"
  | "microphone";

export type AppPermissionItem = {
  id: AppPermissionId;
  title: string;
  description: string;
  androidOnly?: boolean;
};

export const APP_PERMISSION_ITEMS: AppPermissionItem[] = [
  {
    id: "sms",
    title: "Bank SMS",
    description:
      "Detect debit and credit alerts automatically. OTPs and promos are filtered out.",
    androidOnly: true,
  },
  {
    id: "notifications",
    title: "Notifications",
    description:
      "Budget alerts and confirmations when Dime adds an expense for you.",
  },
  {
    id: "camera",
    title: "Camera",
    description: "Scan receipts to create transactions without typing.",
  },
  {
    id: "microphone",
    title: "Microphone",
    description: "Capture spoken expenses with your voice.",
  },
];

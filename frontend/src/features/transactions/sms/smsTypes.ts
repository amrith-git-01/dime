export const SMS_SESSION_CAP = 50;

export type InboxSms = {
  id: string;
  address: string;
  body: string;
  dateMs: number;
};

export type SmsListenerMessage = {
  id: string;
  sender: string;
  body: string;
  timestamp: number;
};

export type SmsListenerModule = {
  startSmsListener: (callback: (message: SmsListenerMessage) => void) => void;
  stopSmsListener: () => void;
};

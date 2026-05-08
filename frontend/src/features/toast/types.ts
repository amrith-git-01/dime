export type ToastVariant = "success" | "error" | "warning" | "info";

export type ToastPosition = "bottom" | "top";

export type ToastAction = {
  label: string;
  onPress?: () => void;
};

export type ToastInput = {
  message: string;
  variant?: ToastVariant;
  position?: ToastPosition;
  durationMs?: number;
  action?: ToastAction;
};

export type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
  position: ToastPosition;
  durationMs: number;
  action?: ToastAction;
};

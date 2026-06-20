import { useSmsCaptureService } from "@/features/capture/hooks/useSmsCaptureService";

type SmsCaptureBootstrapProps = {
  active: boolean;
};

/** Headless hook host for the Android SMS capture listener. */
export function SmsCaptureBootstrap({ active }: SmsCaptureBootstrapProps) {
  useSmsCaptureService(active);
  return null;
}

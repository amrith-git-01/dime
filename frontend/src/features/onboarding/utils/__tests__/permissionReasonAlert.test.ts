import { Alert, type AlertButton } from "react-native";

import {
  getAppPermissionStatus,
  type AppPermissionStatus,
} from "../appPermissions";
import { confirmCapturePermissionReason } from "../permissionReasonAlert";

jest.mock("../appPermissions", () => ({
  getAppPermissionStatus: jest.fn(),
}));

function setStatus(status: AppPermissionStatus): void {
  (getAppPermissionStatus as jest.Mock).mockResolvedValue(status);
}

function tap(label: string): void {
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as
    | AlertButton[]
    | undefined;
  buttons?.find((button) => button.text === label)?.onPress?.();
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("confirmCapturePermissionReason", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  });

  it.each([
    ["camera", "Dime needs the camera to read your receipt."],
    ["microphone", "Dime needs the microphone to hear your expense."],
  ] as const)(
    "before the first %s dialog, gives a one-line reason and continues on Continue",
    async (id, message) => {
      setStatus("undetermined");
      const result = confirmCapturePermissionReason(id);
      await flush();
      expect((Alert.alert as jest.Mock).mock.calls[0][1]).toBe(message);
      tap("Continue");
      await expect(result).resolves.toBe(true);
    },
  );

  it("stops on Not now, so the system dialog is never shown", async () => {
    setStatus("undetermined");
    const result = confirmCapturePermissionReason("camera");
    await flush();
    tap("Not now");
    await expect(result).resolves.toBe(false);
  });

  it.each<AppPermissionStatus>(["granted", "denied"])(
    "goes straight through when the permission is already %s (denial handling stays with the caller)",
    async (status) => {
      setStatus(status);
      await expect(confirmCapturePermissionReason("microphone")).resolves.toBe(
        true,
      );
      expect(Alert.alert).not.toHaveBeenCalled();
    },
  );
});

import { QueryClient } from "@tanstack/react-query";
import { Alert, type AlertButton } from "react-native";

import { resetMockMmkv } from "@/test-utils/mockMmkv";

import { askNotificationsInContext } from "../askNotificationsInContext";
import {
  getAppPermissionStatus,
  requestAppPermission,
  type AppPermissionStatus,
} from "../appPermissions";

import { settingsQueryKeys } from "@/features/settings/queryKeys";
import { syncExpoPushTokenForUser } from "@/features/settings/utils/syncExpoPushToken";

jest.mock("react-native-mmkv", () =>
  jest.requireActual("@/test-utils/mockMmkv"),
);
jest.mock("../appPermissions", () => ({
  getAppPermissionStatus: jest.fn(),
  requestAppPermission: jest.fn(),
}));
jest.mock("@/features/settings/utils/syncExpoPushToken", () => ({
  PushPermissionDeniedError: class PushPermissionDeniedError extends Error {},
  syncExpoPushTokenForUser: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/lib/reportError", () => ({ reportError: jest.fn() }));

const REASON = "Get a heads-up when you're close to your monthly budget.";

function setStatus(status: AppPermissionStatus): void {
  (getAppPermissionStatus as jest.Mock).mockResolvedValue(status);
}

/** Taps the button with this label on the alert that was just shown. */
function tap(label: string): void {
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as
    | AlertButton[]
    | undefined;
  buttons?.find((button) => button.text === label)?.onPress?.();
}

/** Lets the helper reach its next await (the alert is shown after a permission check). */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("askNotificationsInContext", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = new QueryClient();
    resetMockMmkv();
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    (requestAppPermission as jest.Mock).mockResolvedValue(true);
  });

  it("explains first, then asks the system, then registers the token", async () => {
    setStatus("undetermined");
    const done = askNotificationsInContext(REASON, qc);
    await flush();

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect((Alert.alert as jest.Mock).mock.calls[0][1]).toBe(REASON);
    expect(requestAppPermission).not.toHaveBeenCalled();

    tap("Allow");
    await done;
    expect(requestAppPermission).toHaveBeenCalledWith("notifications");
    // The permission was just answered: register without a second system dialog.
    expect(syncExpoPushTokenForUser).toHaveBeenCalledWith(true, {
      requestPermission: false,
    });
  });

  it("does not register a token when the system dialog is declined", async () => {
    setStatus("undetermined");
    (requestAppPermission as jest.Mock).mockResolvedValue(false);
    const done = askNotificationsInContext(REASON, qc);
    await flush();
    tap("Allow");
    await done;
    expect(syncExpoPushTokenForUser).not.toHaveBeenCalled();
  });

  it("never reaches the system dialog when the user says Not now", async () => {
    setStatus("undetermined");
    const done = askNotificationsInContext(REASON, qc);
    await flush();
    tap("Not now");
    await done;
    expect(requestAppPermission).not.toHaveBeenCalled();
    expect(syncExpoPushTokenForUser).not.toHaveBeenCalled();
  });

  it("asks only once per device, even after Not now", async () => {
    setStatus("undetermined");
    const first = askNotificationsInContext(REASON, qc);
    await flush();
    tap("Not now");
    await first;

    await askNotificationsInContext(REASON, qc);
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });

  it.each<AppPermissionStatus>(["granted", "denied"])(
    "stays quiet when the permission is already %s",
    async (status) => {
      setStatus(status);
      await askNotificationsInContext(REASON, qc);
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(requestAppPermission).not.toHaveBeenCalled();
    },
  );

  it("stays quiet when Notifications are switched off in Dime's Settings", async () => {
    setStatus("undetermined");
    qc.setQueryData(settingsQueryKeys.user("u1"), { deviceNotificationsEnabled: false });
    await askNotificationsInContext(REASON, qc);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(requestAppPermission).not.toHaveBeenCalled();
  });

  it("never throws, whatever goes wrong", async () => {
    (getAppPermissionStatus as jest.Mock).mockRejectedValue(new Error("boom"));
    await expect(askNotificationsInContext(REASON, qc)).resolves.toBeUndefined();
  });
});

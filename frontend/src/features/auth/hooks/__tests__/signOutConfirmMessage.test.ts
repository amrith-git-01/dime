import { signOutConfirmMessage } from "../useConfirmSignOut";

jest.mock("../useSignOut", () => ({ useSignOut: () => ({ signOut: jest.fn(), loading: false }) }));
jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

describe("signOutConfirmMessage", () => {
  it("is the plain question when nothing is waiting to sync", () => {
    expect(signOutConfirmMessage(0)).toBe("You'll need to sign in again to use the app.");
  });

  it("names the entries that signing out would delete", () => {
    expect(signOutConfirmMessage(1)).toBe(
      "You'll need to sign in again to use the app. 1 unsynced entry on this device will be deleted.",
    );
    expect(signOutConfirmMessage(3)).toBe(
      "You'll need to sign in again to use the app. 3 unsynced entries on this device will be deleted.",
    );
  });
});

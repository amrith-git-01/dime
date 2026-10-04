import {
  isUnhandledNotificationResponseStamp,
  notificationResponseStamp,
} from "../notificationResponseStamp";

describe("notificationResponseStamp", () => {
  const stamp = notificationResponseStamp("abc", 1_700_000_000_000);

  it("joins id and date", () => {
    expect(stamp).toBe("abc:1700000000000");
  });

  it("treats a null last-handled stamp as unhandled", () => {
    expect(isUnhandledNotificationResponseStamp(stamp, null)).toBe(true);
  });

  it("does not re-open Notifications for the same stamp", () => {
    expect(isUnhandledNotificationResponseStamp(stamp, stamp)).toBe(false);
  });

  it("treats a new date as a fresh tap", () => {
    expect(isUnhandledNotificationResponseStamp(stamp, "abc:1")).toBe(true);
  });
});

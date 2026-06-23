import {
  isUnhandledNotificationResponseStamp,
  notificationResponseStamp,
} from "../notificationResponseStamp";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function run(): void {
  const stamp = notificationResponseStamp("abc", 1_700_000_000_000);
  assert(stamp === "abc:1700000000000", "stamp joins id and date");
  assert(
    isUnhandledNotificationResponseStamp(stamp, null),
    "null last handled means unhandled",
  );
  assert(
    !isUnhandledNotificationResponseStamp(stamp, stamp),
    "same stamp must not re-open Notifications",
  );
  assert(
    isUnhandledNotificationResponseStamp(stamp, "abc:1"),
    "new date is a fresh tap",
  );
  console.log("notification response stamp tests passed");
}

run();

import { parseReminderTime } from "../parseReminderTime";

function expect<T>(actual: T) {
  return {
    toEqual(expected: T) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
          `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
        );
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null, received ${JSON.stringify(actual)}`);
      }
    },
  };
}

export function runParseReminderTimeTests(): void {
  expect(parseReminderTime("20:00")).toEqual({ hour: 20, minute: 0 });
  expect(parseReminderTime("21:30")).toEqual({ hour: 21, minute: 30 });
  expect(parseReminderTime("25:00")).toBeNull();
  expect(parseReminderTime("bad")).toBeNull();
}

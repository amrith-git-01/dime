import { parseReminderTime } from "../parseReminderTime";

describe("parseReminderTime", () => {
  it("parses valid HH:mm values", () => {
    expect(parseReminderTime("20:00")).toEqual({ hour: 20, minute: 0 });
    expect(parseReminderTime("21:30")).toEqual({ hour: 21, minute: 30 });
  });

  it("returns null for invalid values", () => {
    expect(parseReminderTime("25:00")).toBeNull();
    expect(parseReminderTime("bad")).toBeNull();
  });
});

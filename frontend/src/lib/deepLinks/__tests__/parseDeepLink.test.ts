import { deepLinkUrls } from "../deepLinkUrls";
import { parseDeepLink } from "../parseDeepLink";

const NOW = new Date(2026, 9, 15, 18, 30);

describe("parseDeepLink", () => {
  it("parses every widget link", () => {
    expect(parseDeepLink(deepLinkUrls.home, NOW)).toEqual({ kind: "home" });
    expect(parseDeepLink(deepLinkUrls.scan, NOW)).toEqual({ kind: "scan" });
    expect(parseDeepLink(deepLinkUrls.voice, NOW)).toEqual({ kind: "voice" });
    expect(parseDeepLink(deepLinkUrls.agent, NOW)).toEqual({ kind: "agent" });
    expect(parseDeepLink(deepLinkUrls.budgets, NOW)).toEqual({
      kind: "budgets",
      recurring: false,
    });
    expect(parseDeepLink(deepLinkUrls.budgetsRecurring, NOW)).toEqual({
      kind: "budgets",
      recurring: true,
    });
  });

  it("turns date=today into the local day", () => {
    expect(parseDeepLink(deepLinkUrls.addToday, NOW)).toEqual({
      kind: "add",
      date: "2026-10-15",
    });
  });

  it("keeps a valid yyyy-MM-dd date and drops invalid ones", () => {
    expect(parseDeepLink("dime://add?date=2026-09-30", NOW)).toEqual({
      kind: "add",
      date: "2026-09-30",
    });
    expect(parseDeepLink("dime://add?date=2026-13-45", NOW)).toEqual({ kind: "add" });
    expect(parseDeepLink("dime://add?date=tomorrow", NOW)).toEqual({ kind: "add" });
    expect(parseDeepLink("dime://add", NOW)).toEqual({ kind: "add" });
  });

  it("ignores case, trailing slashes and unrelated query params", () => {
    expect(parseDeepLink("DIME://Budgets/Recurring/", NOW)).toEqual({
      kind: "budgets",
      recurring: true,
    });
    expect(parseDeepLink("dime://home?utm=widget", NOW)).toEqual({ kind: "home" });
  });

  it("returns null for unknown targets, other schemes and empty input", () => {
    expect(parseDeepLink("dime://nope", NOW)).toBeNull();
    expect(parseDeepLink("dime://", NOW)).toBeNull();
    expect(parseDeepLink("frontend://home", NOW)).toBeNull();
    expect(parseDeepLink("https://example.com/home", NOW)).toBeNull();
    expect(parseDeepLink("", NOW)).toBeNull();
    expect(parseDeepLink(null, NOW)).toBeNull();
    expect(parseDeepLink(undefined, NOW)).toBeNull();
  });
});

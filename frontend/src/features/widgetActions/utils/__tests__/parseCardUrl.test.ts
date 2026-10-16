import { cardLinkUrl } from "@/lib/deepLinks/deepLinkUrls";
import { getWidgetCardToken } from "@/lib/widgets/widgetCardToken";
import { resetMockMmkv } from "@/test-utils/mockMmkv";

import { parseCardUrl } from "../parseCardUrl";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

describe("parseCardUrl", () => {
  beforeEach(resetMockMmkv);

  it("parses the widget's four card links as trusted", () => {
    const token = getWidgetCardToken();
    for (const mode of ["add", "scan", "gallery", "voice"] as const) {
      expect(parseCardUrl(cardLinkUrl(mode, token))).toEqual({ mode, trusted: true });
    }
  });

  it("builds links that carry the token", () => {
    expect(cardLinkUrl("scan", "abc")).toBe("dimecard://scan?t=abc");
  });

  it("treats a link without the token, or with a wrong one, as untrusted", () => {
    getWidgetCardToken();
    expect(parseCardUrl("dimecard://voice")).toEqual({ mode: "voice", trusted: false });
    expect(parseCardUrl("dimecard://voice?t=")).toEqual({ mode: "voice", trusted: false });
    expect(parseCardUrl(`dimecard://voice?t=${"0".repeat(32)}`)).toEqual({
      mode: "voice",
      trusted: false,
    });
  });

  it("ignores case, a trailing slash and other query parameters", () => {
    const token = getWidgetCardToken();
    expect(parseCardUrl(`DIMECARD://Scan/?from=widget&t=${token}`)).toEqual({
      mode: "scan",
      trusted: true,
    });
  });

  it("returns null for the app links, other schemes, unknown modes and empty input", () => {
    expect(parseCardUrl("dime://add")).toBeNull();
    expect(parseCardUrl("dime://agent")).toBeNull();
    expect(parseCardUrl("https://example.com/add")).toBeNull();
    expect(parseCardUrl("dimecard://nope")).toBeNull();
    expect(parseCardUrl("dimecard://")).toBeNull();
    expect(parseCardUrl("")).toBeNull();
    expect(parseCardUrl(null)).toBeNull();
    expect(parseCardUrl(undefined)).toBeNull();
  });
});

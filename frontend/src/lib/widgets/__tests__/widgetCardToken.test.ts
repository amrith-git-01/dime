import { createMMKV, resetMockMmkv } from "@/test-utils/mockMmkv";

import { getWidgetCardToken, isWidgetCardToken } from "../widgetCardToken";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

describe("widget card token", () => {
  beforeEach(resetMockMmkv);

  it("is created once, random-looking, and stored in the device settings", () => {
    const token = getWidgetCardToken();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(getWidgetCardToken()).toBe(token);
    expect(createMMKV({ id: "dime-settings" }).getString("widget.card_token")).toBe(token);
  });

  it("replaces a damaged stored value", () => {
    createMMKV({ id: "dime-settings" }).set("widget.card_token", "short");
    expect(getWidgetCardToken()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("accepts only this install token", () => {
    const token = getWidgetCardToken();
    expect(isWidgetCardToken(token)).toBe(true);
    expect(isWidgetCardToken("0".repeat(32))).toBe(false);
    expect(isWidgetCardToken("")).toBe(false);
    expect(isWidgetCardToken(undefined)).toBe(false);
  });
});

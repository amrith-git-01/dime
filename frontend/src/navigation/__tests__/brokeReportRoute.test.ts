import { brokeReportScreenOptions, getBrokeReportScreenId } from "../brokeReportRoute";

describe("BrokeReport route", () => {
  it("is one screen per report: another month is another screen, the same month is the same one", () => {
    expect(getBrokeReportScreenId({ params: { periodKey: "2026-10" } })).toBe("2026-10");
    expect(getBrokeReportScreenId({ params: { periodKey: "2026-09" } })).toBe("2026-09");
    expect(getBrokeReportScreenId({ params: { periodKey: "sample" } })).toBe("sample");
  });

  it("covers the tabs without a header", () => {
    expect(brokeReportScreenOptions).toMatchObject({
      headerShown: false,
      presentation: "transparentModal",
      animation: "fade",
    });
  });
});

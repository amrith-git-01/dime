import type { WidgetTaskHandlerProps } from "react-native-android-widget";

import { settlePendingCaptures } from "@/features/widgetActions/utils/settleCapture";
import { getSession } from "@/lib/auth/session";
import { resetMockMmkv } from "@/test-utils/mockMmkv";

import { widgetTaskHandler } from "../widgetTaskHandler";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("react-native-android-widget", () => {
  const primitive = (name: string) => Object.assign(() => null, { __name__: name });
  return {
    FlexWidget: primitive("LinearLayoutWidget"),
    TextWidget: primitive("TextWidget"),
    SvgWidget: primitive("SvgWidget"),
    requestWidgetUpdate: jest.fn().mockResolvedValue(undefined),
  };
});
jest.mock("@/features/widgetActions/utils/settleCapture", () => ({
  settlePendingCaptures: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/auth/session", () => ({ getSession: jest.fn() }));
jest.mock("@/lib/reportError", () => ({ reportError: jest.fn() }));

const renderWidget = jest.fn();

function props(overrides: Partial<WidgetTaskHandlerProps>): WidgetTaskHandlerProps {
  return {
    widgetInfo: {
      widgetName: "Dime",
      widgetId: 1,
      height: 200,
      width: 320,
      screenInfo: { screenHeightDp: 0, screenWidthDp: 0, density: 1, densityDpi: 160 },
    },
    widgetAction: "WIDGET_UPDATE",
    renderWidget,
    ...overrides,
  };
}

describe("widgetTaskHandler", () => {
  beforeEach(() => {
    resetMockMmkv();
    jest.clearAllMocks();
    jest.mocked(getSession).mockReturnValue({ user: { id: "user-a" } } as never);
  });

  it("draws on add and resize without touching the network", async () => {
    await widgetTaskHandler(props({ widgetAction: "WIDGET_ADDED" }));
    await widgetTaskHandler(props({ widgetAction: "WIDGET_RESIZED" }));
    expect(renderWidget).toHaveBeenCalledTimes(2);
    expect(settlePendingCaptures).not.toHaveBeenCalled();
  });

  it("on a periodic update draws first, settles waiting captures within 5 s, then draws again", async () => {
    const order: string[] = [];
    renderWidget.mockImplementation(() => order.push("render"));
    jest.mocked(settlePendingCaptures).mockImplementationOnce(async () => {
      order.push("settle");
    });
    await widgetTaskHandler(props({ widgetAction: "WIDGET_UPDATE" }));
    expect(order).toEqual(["render", "settle", "render"]);
    expect(settlePendingCaptures).toHaveBeenCalledWith("user-a", 5_000);
  });

  it("settles nothing for a signed-out device, and still draws", async () => {
    jest.mocked(getSession).mockReturnValue(null);
    await widgetTaskHandler(props({ widgetAction: "WIDGET_UPDATE" }));
    expect(settlePendingCaptures).toHaveBeenCalledWith(undefined, 5_000);
    expect(renderWidget).toHaveBeenCalledTimes(2);
  });

  it("survives a failing settle and draws the last good state", async () => {
    jest.mocked(settlePendingCaptures).mockRejectedValueOnce(new Error("offline"));
    await expect(widgetTaskHandler(props({ widgetAction: "WIDGET_UPDATE" }))).resolves.toBeUndefined();
    expect(renderWidget).toHaveBeenCalledTimes(2);
  });

  it("does not draw a widget this build does not know, and ignores deletion", async () => {
    await widgetTaskHandler(
      props({ widgetInfo: { ...props({}).widgetInfo, widgetName: "QuickAdd" } }),
    );
    await widgetTaskHandler(props({ widgetAction: "WIDGET_DELETED" }));
    expect(renderWidget).not.toHaveBeenCalled();
  });
});

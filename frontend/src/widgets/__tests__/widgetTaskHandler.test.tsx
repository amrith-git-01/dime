import type { WidgetTaskHandlerProps } from "react-native-android-widget";

import {
  drainWidgetOutbox,
  runWidgetPreset,
  undoLastWidgetAction,
} from "@/lib/widgets/widgetPresetActions";
import { resetMockMmkv } from "@/test-utils/mockMmkv";

import { widgetTaskHandler } from "../widgetTaskHandler";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("react-native-android-widget", () => {
  const primitive = (name: string) => Object.assign(() => null, { __name__: name });
  return {
    FlexWidget: primitive("LinearLayoutWidget"),
    TextWidget: primitive("TextWidget"),
    requestWidgetUpdate: jest.fn().mockResolvedValue(undefined),
  };
});
jest.mock("@/lib/widgets/widgetPresetActions", () => ({
  drainWidgetOutbox: jest.fn().mockResolvedValue(0),
  runWidgetPreset: jest.fn().mockResolvedValue(undefined),
  undoLastWidgetAction: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/reportError", () => ({ reportError: jest.fn() }));

const renderWidget = jest.fn();

function props(overrides: Partial<WidgetTaskHandlerProps>): WidgetTaskHandlerProps {
  return {
    widgetInfo: {
      widgetName: "QuickAdd",
      widgetId: 1,
      height: 150,
      width: 300,
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
  });

  it("draws on add and resize without touching the network", async () => {
    await widgetTaskHandler(props({ widgetAction: "WIDGET_ADDED" }));
    await widgetTaskHandler(props({ widgetAction: "WIDGET_RESIZED" }));
    expect(renderWidget).toHaveBeenCalledTimes(2);
    expect(drainWidgetOutbox).not.toHaveBeenCalled();
  });

  it("on a periodic update draws first, then drains the outbox", async () => {
    const order: string[] = [];
    renderWidget.mockImplementation(() => order.push("render"));
    jest.mocked(drainWidgetOutbox).mockImplementationOnce(async () => {
      order.push("drain");
      return 0;
    });
    await widgetTaskHandler(props({ widgetAction: "WIDGET_UPDATE" }));
    expect(order).toEqual(["render", "drain"]);
  });

  it("runs a preset tap with the index from the click data, then redraws", async () => {
    await widgetTaskHandler(
      props({
        widgetAction: "WIDGET_CLICK",
        clickAction: "PRESET",
        clickActionData: { index: 1 },
      }),
    );
    expect(runWidgetPreset).toHaveBeenCalledWith(1, expect.any(Function));
    expect(renderWidget).toHaveBeenCalled();
  });

  it("ignores a preset tap without a usable index", async () => {
    await widgetTaskHandler(
      props({ widgetAction: "WIDGET_CLICK", clickAction: "PRESET", clickActionData: {} }),
    );
    expect(runWidgetPreset).not.toHaveBeenCalled();
  });

  it("runs Undo", async () => {
    await widgetTaskHandler(props({ widgetAction: "WIDGET_CLICK", clickAction: "UNDO" }));
    expect(undoLastWidgetAction).toHaveBeenCalledTimes(1);
  });

  it("survives a failing action and still redraws", async () => {
    jest.mocked(runWidgetPreset).mockRejectedValueOnce(new Error("boom"));
    await expect(
      widgetTaskHandler(
        props({
          widgetAction: "WIDGET_CLICK",
          clickAction: "PRESET",
          clickActionData: { index: 0 },
        }),
      ),
    ).resolves.toBeUndefined();
    expect(renderWidget).toHaveBeenCalled();
  });

  it("does nothing for a deleted widget", async () => {
    await widgetTaskHandler(props({ widgetAction: "WIDGET_DELETED" }));
    expect(renderWidget).not.toHaveBeenCalled();
    expect(drainWidgetOutbox).not.toHaveBeenCalled();
  });
});

import type { ReactElement } from "react";
import { Linking } from "react-native";

import { cardLinkUrl } from "@/lib/deepLinks/deepLinkUrls";
import { getWidgetCardToken } from "@/lib/widgets/widgetCardToken";

import { useCardLaunch, type CardLaunch } from "../useCardLaunch";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => Promise<void> | void) => Promise<void>;
  create: (element: ReactElement) => { unmount: () => void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

let latest: CardLaunch | null | undefined;
function Probe() {
  latest = useCardLaunch();
  return null;
}

type Renderer = { unmount: () => void };

/** Mounts the probe inside act; the launch URL promise has not resolved yet. */
async function mount(): Promise<Renderer> {
  let renderer: Renderer | undefined;
  await act(() => {
    renderer = create(<Probe />);
  });
  return renderer!;
}

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe("useCardLaunch", () => {
  let urlListener: ((event: { url: string }) => void) | undefined;
  const remove = jest.fn();

  beforeEach(() => {
    latest = undefined;
    urlListener = undefined;
    remove.mockClear();
    jest.spyOn(Linking, "addEventListener").mockImplementation(((
      _type: string,
      listener: (event: { url: string }) => void,
    ) => {
      urlListener = listener;
      return { remove };
    }) as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it("is null until the launch URL is read, then the mode of the button that opened the card", async () => {
    let resolveUrl: (url: string) => void = () => undefined;
    jest.spyOn(Linking, "getInitialURL").mockReturnValue(
      new Promise<string>((resolve) => {
        resolveUrl = resolve;
      }),
    );
    const renderer = await mount();
    expect(latest).toBeNull();
    await act(async () => resolveUrl(cardLinkUrl("scan", getWidgetCardToken())));
    expect(latest).toEqual({ mode: "scan", trusted: true, launchId: 1 });
    renderer.unmount();
  });

  it("reports an unknown launch URL as no mode, so the card can close", async () => {
    jest.spyOn(Linking, "getInitialURL").mockResolvedValue("dime://home");
    const renderer = await mount();
    await flush();
    expect(latest).toEqual({ mode: null, trusted: false, launchId: 1 });
    renderer.unmount();
  });

  it("starts over when another button is tapped while the card is open", async () => {
    jest.spyOn(Linking, "getInitialURL").mockResolvedValue(cardLinkUrl("add", getWidgetCardToken()));
    const renderer = await mount();
    await flush();
    await act(async () => urlListener?.({ url: "dimecard://voice" }));
    // A second tap from outside the widget (no token) is not trusted, whatever the first one was.
    expect(latest).toEqual({ mode: "voice", trusted: false, launchId: 2 });
    renderer.unmount();
  });

  it("ignores the app's own links, which the main app handles in this same JS runtime", async () => {
    jest.spyOn(Linking, "getInitialURL").mockResolvedValue(cardLinkUrl("add", getWidgetCardToken()));
    const renderer = await mount();
    await flush();
    await act(async () => urlListener?.({ url: "dime://agent" }));
    expect(latest).toEqual({ mode: "add", trusted: true, launchId: 1 });
    renderer.unmount();
    expect(remove).toHaveBeenCalled();
  });
});

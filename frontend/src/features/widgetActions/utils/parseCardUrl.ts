import { CARD_LINK_SCHEME, type CardLinkMode } from "@/lib/deepLinks/deepLinkUrls";
import { isWidgetCardToken } from "@/lib/widgets/widgetCardToken";

/** What the widget's button asked the capture card to do. */
export type CardMode = CardLinkMode;

export type CardLaunchRequest = {
  mode: CardMode;
  /** The link carries this install's token, so it came from our own widget. Otherwise the card asks first. */
  trusted: boolean;
};

const CARD_MODES: readonly CardMode[] = ["add", "scan", "gallery", "voice"];
const URL_PATTERN = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)[^?#]*(?:\?([^#]*))?/i;

function queryParam(query: string | undefined, name: string): string | undefined {
  for (const pair of (query ?? "").split("&")) {
    const [key, value = ""] = pair.split("=");
    if (key === name) {
      return value;
    }
  }
  return undefined;
}

/** The request in a `dimecard://<mode>?t=<token>` URL; null for other schemes and unknown modes. */
export function parseCardUrl(url: string | null | undefined): CardLaunchRequest | null {
  const match = url ? URL_PATTERN.exec(url.trim()) : null;
  if (!match || match[1]!.toLowerCase() !== CARD_LINK_SCHEME) {
    return null;
  }
  const mode = match[2]!.toLowerCase();
  if (!(CARD_MODES as readonly string[]).includes(mode)) {
    return null;
  }
  return { mode: mode as CardMode, trusted: isWidgetCardToken(queryParam(match[3], "t")) };
}

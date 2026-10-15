import { format, isValid, parse } from "date-fns";

import { DEEP_LINK_SCHEME } from "./deepLinkUrls";

export type DeepLinkIntent =
  | { kind: "home" }
  /** `date` is a local `yyyy-MM-dd` day; absent means now. */
  | { kind: "add"; date?: string }
  | { kind: "scan" }
  | { kind: "voice" }
  | { kind: "budgets"; recurring: boolean }
  | { kind: "agent" }
  | { kind: "settingsWidgets" };

const URL_PATTERN = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?/i;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function queryParam(query: string | undefined, name: string): string | undefined {
  for (const pair of (query ?? "").split("&")) {
    const [key, value = ""] = pair.split("=");
    if (key === name) {
      try {
        return decodeURIComponent(value);
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** `today` becomes the local date string; a real `yyyy-MM-dd` passes; anything else is dropped. */
function resolveDate(raw: string | undefined, now: Date): string | undefined {
  if (raw === "today") {
    return format(now, "yyyy-MM-dd");
  }
  if (raw && DAY_PATTERN.test(raw) && isValid(parse(raw, "yyyy-MM-dd", now))) {
    return raw;
  }
  return undefined;
}

/**
 * Maps a `dime://` URL to what the app should do. Returns null for other schemes and for
 * unknown targets: those links simply open the app where it was.
 */
export function parseDeepLink(
  url: string | null | undefined,
  now: Date = new Date(),
): DeepLinkIntent | null {
  const match = url ? URL_PATTERN.exec(url.trim()) : null;
  if (!match || match[1]!.toLowerCase() !== DEEP_LINK_SCHEME) {
    return null;
  }
  const target = match[2]!.toLowerCase();
  const path = match[3]!.replace(/^\/+|\/+$/g, "").toLowerCase();
  const query = match[4];

  switch (target) {
    case "home":
      return { kind: "home" };
    case "add": {
      const date = resolveDate(queryParam(query, "date"), now);
      return date ? { kind: "add", date } : { kind: "add" };
    }
    case "scan":
      return { kind: "scan" };
    case "voice":
      return { kind: "voice" };
    case "budgets":
      return { kind: "budgets", recurring: path === "recurring" };
    case "agent":
      return { kind: "agent" };
    case "settings":
      return path === "widgets" ? { kind: "settingsWidgets" } : null;
    default:
      return null;
  }
}

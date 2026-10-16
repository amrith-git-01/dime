import { useEffect, useState } from "react";
import { Linking } from "react-native";

import { parseCardUrl, type CardLaunchRequest, type CardMode } from "../utils/parseCardUrl";

export type CardLaunch = {
  /** Null for a launch URL this build does not know: the card just closes. */
  mode: CardMode | null;
  /** The link carried this install's token: the tap came from our own widget. */
  trusted: boolean;
  /** Changes on every launch, so a tap on another widget button while the card is open starts fresh. */
  launchId: number;
};

/**
 * Which button opened the card. The activity is `singleTask`, so a second tap while it is open
 * arrives as a URL event, not as a new launch. Null until the launch URL has been read. Events for
 * other schemes (`dime://` links the main app handles in this same JS runtime) are not ours.
 */
export function useCardLaunch(): CardLaunch | null {
  const [launch, setLaunch] = useState<CardLaunch | null>(null);

  useEffect(() => {
    let alive = true;
    const start = (request: CardLaunchRequest | null) => {
      if (alive) {
        setLaunch((previous) => ({
          mode: request?.mode ?? null,
          trusted: request?.trusted ?? false,
          launchId: (previous?.launchId ?? 0) + 1,
        }));
      }
    };

    Linking.getInitialURL()
      .then((url) => start(parseCardUrl(url)))
      .catch(() => start(null));
    const subscription = Linking.addEventListener("url", ({ url }) => {
      const request = parseCardUrl(url);
      if (request) {
        start(request);
      }
    });

    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  return launch;
}

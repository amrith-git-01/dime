import { create } from "zustand";

import {
  getLastConfettiDay,
  localDayKey,
  setLastConfettiDay,
} from "@/lib/celebrations/celebrationStorage";
import type { CelebrationKind } from "@/lib/celebrations/particles";
import { getCelebrationsEnabled } from "@/lib/haptics/hapticPreferencesStorage";
import {
  triggerConfirmHaptic,
  triggerTickHaptic,
} from "@/lib/haptics/nativeHaptics";

export type CelebrationRequest = {
  kind: CelebrationKind;
  /** Where it happens, in window coordinates; defaults to the middle of the screen. */
  at?: { x: number; y: number };
  /** Set false when the caller already gave haptic feedback for the same moment. */
  haptic?: boolean;
};

export type CelebrationEvent = {
  id: number;
  kind: CelebrationKind;
  at?: { x: number; y: number };
  /** `particles`: the full effect. `check`: a brief static check badge (no motion). */
  mode: "particles" | "check";
};

type CelebrationState = {
  /** The effect on screen right now; the layer plays it and clears it when done. */
  event: CelebrationEvent | null;
  /** Mirrors the system reduce-motion setting (kept current by `CelebrationLayer`). */
  reduceMotion: boolean;
  /** True while a replayed tour runs: celebrations mark something new, never a replay. */
  suppressed: boolean;
  /**
   * Plays a celebration, applying the rules in one place: nothing when suppressed; no particles
   * (a static check badge and the haptic instead) under reduced motion or with the Celebrations
   * preference off; and big confetti at most once per local day.
   */
  celebrate: (request: CelebrationRequest) => void;
  /** Called by the layer when an event finished playing. */
  clear: (id: number) => void;
  setReduceMotion: (reduceMotion: boolean) => void;
  setSuppressed: (suppressed: boolean) => void;
};

let nextEventId = 1;

export const useCelebrationStore = create<CelebrationState>((set, get) => ({
  event: null,
  reduceMotion: false,
  suppressed: false,

  celebrate: ({ kind, at, haptic = true }) => {
    const { suppressed, reduceMotion } = get();
    if (suppressed) {
      return;
    }

    let mode: CelebrationEvent["mode"] = "particles";
    if (reduceMotion || !getCelebrationsEnabled()) {
      mode = "check";
    } else if (kind === "confetti") {
      const today = localDayKey();
      if (getLastConfettiDay() === today) {
        mode = "check";
      } else {
        setLastConfettiDay(today);
      }
    }

    set({ event: { id: nextEventId++, kind, at, mode } });

    if (haptic) {
      void (kind === "confetti" ? triggerConfirmHaptic() : triggerTickHaptic());
    }
  },

  clear: (id) => {
    if (get().event?.id === id) {
      set({ event: null });
    }
  },

  setReduceMotion: (reduceMotion) => set({ reduceMotion }),
  setSuppressed: (suppressed) => set({ suppressed }),
}));

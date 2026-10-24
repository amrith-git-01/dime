import { useState, type ReactNode } from "react";
import type { LayoutChangeEvent } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";

import { SkeletonBlock } from "@/components/ui";
import { radius } from "@/constants/radius";
import { springs } from "@/constants/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { createThemedStyles } from "@/theme";

import { CardSlotContext } from "./CardSlot";

/** Cards slide to their new place with a spring when the order changes (Done in the Arrange sheet). */
const CARD_LAYOUT_TRANSITION = LinearTransition.springify()
  .damping(springs.smooth.damping)
  .stiffness(springs.smooth.stiffness)
  .mass(springs.smooth.mass);

const LOADING_HEIGHTS = [176, 112, 144] as const;

export type OrderedCardsProps<T extends string> = {
  order: readonly T[];
  /**
   * What each card renders. A card that is absent, null or false has no wrapper at all (the
   * screen decided it shows nothing in this state); a card that renders null itself reports it
   * through `useCardSlotEmpty`.
   */
  cards: Partial<Record<T, ReactNode>>;
  /** False while a new device waits for the saved order: the card area shows a loading state. */
  ready?: boolean;
  /** A card's wrapper was laid out: its `y` is measured in the parent (e.g. the scroll content). */
  onCardLayout?: (id: T, event: LayoutChangeEvent) => void;
};

type CardSlotProps = {
  animated: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
  children: ReactNode;
};

/** One wrapper type for both modes (no layout transition under reduced motion), so cards never remount when the setting flips. */
function CardSlot({ animated, onLayout, children }: CardSlotProps) {
  const styles = useStyles();
  const [empty, setEmpty] = useState(false);
  return (
    <CardSlotContext.Provider value={setEmpty}>
      <Animated.View
        layout={animated ? CARD_LAYOUT_TRANSITION : undefined}
        style={empty ? styles.empty : undefined}
        onLayout={onLayout}
      >
        {children}
      </Animated.View>
    </CardSlotContext.Provider>
  );
}

/**
 * Renders a screen's cards in the user's order, each in a keyed wrapper that animates to its new
 * place (no animation under reduced motion). Renders as siblings, so the parent's `gap` spaces them.
 */
export function OrderedCards<T extends string>({
  order,
  cards,
  ready = true,
  onCardLayout,
}: OrderedCardsProps<T>) {
  const styles = useStyles();
  const reduceMotion = useReduceMotion();

  if (!ready) {
    return (
      <>
        {LOADING_HEIGHTS.map((height) => (
          <SkeletonBlock key={height} style={[styles.loading, { height }]} />
        ))}
      </>
    );
  }

  return (
    <>
      {order.map((id) => {
        const card = cards[id];
        if (card === undefined || card === null || card === false) {
          return null;
        }
        return (
          <CardSlot
            key={id}
            animated={!reduceMotion}
            onLayout={onCardLayout ? (event) => onCardLayout(id, event) : undefined}
          >
            {card}
          </CardSlot>
        );
      })}
    </>
  );
}

const useStyles = createThemedStyles(() => ({
  empty: {
    display: "none",
  },
  loading: {
    borderRadius: radius.lg,
  },
}));

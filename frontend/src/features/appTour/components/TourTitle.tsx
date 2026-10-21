import { memo, useEffect, useMemo, useState, type RefObject } from "react";
import { Text, View, type TextStyle } from "react-native";

import { withAlpha } from "@/constants";

import type { TourMotion } from "../utils/tourMotion";

export type TourTitleProps = {
  text: string;
  /** The card is showing: the words appear one after the other (and all go when it hides). */
  play: boolean;
  motion: TourMotion;
  /** Includes its own top margin and text alignment. */
  style: TextStyle;
  /** The container, so the overlay can move screen-reader focus to the title. */
  titleRef: RefObject<View | null>;
};

/**
 * The step title, appearing a word at a time. It is ONE block of text (every word is already laid
 * out, the unrevealed ones just transparent), so the title always takes the height it will have:
 * nothing reflows as the words arrive. The whole title is one accessible heading.
 */
export const TourTitle = memo(function TourTitle({
  text,
  play,
  motion,
  style,
  titleRef,
}: TourTitleProps) {
  const words = useMemo(() => text.split(" "), [text]);
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (!play) {
      setRevealed(0);
      return;
    }
    let count = 0;
    setRevealed(0);
    const timer = setInterval(() => {
      count += 1;
      setRevealed(count);
      if (count >= words.length) {
        clearInterval(timer);
      }
    }, Math.max(20, motion.wordStaggerMs));
    return () => clearInterval(timer);
  }, [play, words.length, motion.wordStaggerMs]);

  const hidden = typeof style.color === "string" ? withAlpha(style.color, 0) : "transparent";

  return (
    <View
      ref={titleRef}
      accessible
      accessibilityRole="header"
      accessibilityLabel={text}
    >
      <Text style={style}>
        {words.map((word, index) => (
          <Text key={`${index}:${word}`} style={index < revealed ? undefined : { color: hidden }}>
            {index < words.length - 1 ? `${word} ` : word}
          </Text>
        ))}
      </Text>
    </View>
  );
});

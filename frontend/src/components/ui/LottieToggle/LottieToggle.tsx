import LottieView from "lottie-react-native";
import { memo, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import discordToggle from "@/assets/lottie/discord-toggle.json";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";

/** Lottie comp bounds from discord-toggle.json (colors pre-mapped to inkFaint/accent). */
const LOTTIE_WIDTH = 250;
const LOTTIE_HEIGHT = 140;
const LAST_FRAME = 69;
/** Playback multiplier — native Lottie default 1 feels sluggish on this asset. */
const TOGGLE_SPEED = 1.85;

/** Visible toggle footprint — close to native Switch (~51×31). */
export const LOTTIE_TOGGLE_WIDTH = 52;
export const LOTTIE_TOGGLE_HEIGHT = Math.round(
  (LOTTIE_TOGGLE_WIDTH * LOTTIE_HEIGHT) / LOTTIE_WIDTH,
);

export type LottieToggleProps = {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  /** Visible width in dp. Height scales from comp aspect ratio. */
  width?: number;
  /** True while a transition animation is playing. */
  onAnimationBusyChange?: (busy: boolean) => void;
};

export const LottieToggle = memo(function LottieToggle({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
  width = LOTTIE_TOGGLE_WIDTH,
  onAnimationBusyChange,
}: LottieToggleProps) {
  const animationRef = useRef<LottieView>(null);
  const didMountRef = useRef(false);
  const displayedRef = useRef(value);
  const targetRef = useRef(value);
  const busyRef = useRef(false);
  const commitOnFinishRef = useRef(false);
  const onBusyChangeRef = useRef(onAnimationBusyChange);
  const onValueChangeRef = useRef(onValueChange);
  const [busy, setBusy] = useState(false);

  onBusyChangeRef.current = onAnimationBusyChange;
  onValueChangeRef.current = onValueChange;

  const height = Math.round((width * LOTTIE_HEIGHT) / LOTTIE_WIDTH);
  const scale = width / LOTTIE_WIDTH;
  const lottieWidth = LOTTIE_WIDTH * scale;
  const lottieHeight = LOTTIE_HEIGHT * scale;

  const setBusyState = (next: boolean) => {
    if (busyRef.current === next) {
      return;
    }
    busyRef.current = next;
    setBusy(next);
    onBusyChangeRef.current?.(next);
  };

  const playTo = (to: boolean, commitOnFinish: boolean) => {
    const animation = animationRef.current;
    if (!animation) {
      return;
    }
    commitOnFinishRef.current = commitOnFinish;
    targetRef.current = to;
    setBusyState(true);
    if (to) {
      void animation.play(0, LAST_FRAME);
    } else {
      void animation.play(LAST_FRAME, 0);
    }
  };

  useEffect(() => {
    const animation = animationRef.current;
    if (!animation) {
      return;
    }

    if (!didMountRef.current) {
      didMountRef.current = true;
      displayedRef.current = value;
      targetRef.current = value;
      void animation.play(value ? LAST_FRAME : 0, value ? LAST_FRAME : 0);
      return;
    }

    if (busyRef.current) {
      return;
    }
    if (value === displayedRef.current) {
      return;
    }

    playTo(value, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to external value sync
  }, [value]);

  const handleAnimationFinish = (isCancelled?: boolean) => {
    if (isCancelled || !busyRef.current) {
      return;
    }

    const to = targetRef.current;
    displayedRef.current = to;
    const shouldCommit = commitOnFinishRef.current;
    commitOnFinishRef.current = false;
    setBusyState(false);

    if (shouldCommit) {
      onValueChangeRef.current(to);
    }
  };

  const handlePress = () => {
    if (disabled || busyRef.current) {
      return;
    }
    void triggerHaptic();
    playTo(!displayedRef.current, true);
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || busy}
      accessibilityRole="switch"
      accessibilityState={{
        checked: displayedRef.current,
        disabled: disabled || busy,
      }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed }) => [
        styles.hitTarget,
        disabled && styles.disabled,
        pressed && !disabled && !busy && styles.pressed,
      ]}
    >
      <View style={[styles.clip, { width, height }]}>
        <LottieView
          ref={animationRef}
          source={discordToggle}
          loop={false}
          autoPlay={false}
          speed={TOGGLE_SPEED}
          onAnimationFinish={handleAnimationFinish}
          style={{ width: lottieWidth, height: lottieHeight }}
        />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  hitTarget: {
    alignItems: "center",
    justifyContent: "center",
  },
  clip: {
    overflow: "hidden",
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.88,
  },
});

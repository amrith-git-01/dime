import { Canvas, Path, Skia } from "@shopify/react-native-skia";
import { Check } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { useReduceMotion } from "@/hooks/useReduceMotion";
import {
  buildBurstParticles,
  buildConfettiParticles,
  CELEBRATION_DURATION_MS,
  MEDIUM_CONFETTI_PARTICLE_COUNT,
  particleFrame,
  type CelebrationParticle,
} from "@/lib/celebrations/particles";
import {
  useCelebrationStore,
  type CelebrationEvent,
} from "@/stores/celebrationStore";
import { createThemedStyles, useTheme } from "@/theme";

const CHECK_BADGE_SIZE = 56;
const CHECK_HOLD_MS = 700;

type LayerSize = { width: number; height: number };
type Point = { x: number; y: number };

/**
 * One Skia path for every particle of one colour, rebuilt on the UI thread each frame: no
 * per-particle React state and a single draw call per colour. Coins are rings (even-odd fill).
 */
const ParticleGroup = memo(function ParticleGroup({
  particles,
  color,
  coins,
  progress,
}: {
  particles: readonly CelebrationParticle[];
  color: string;
  coins: boolean;
  progress: SharedValue<number>;
}) {
  const path = useDerivedValue(() => {
    const result = Skia.Path.Make();
    const t = progress.value;
    for (let i = 0; i < particles.length; i += 1) {
      const particle = particles[i];
      const frame = particleFrame(particle, t);
      if (frame.scale <= 0) {
        continue;
      }
      if (coins) {
        const r = (particle.size / 2) * frame.scale;
        result.addCircle(frame.x, frame.y, r);
        result.addCircle(frame.x, frame.y, r * 0.5);
        continue;
      }
      const halfW = (particle.size / 2) * frame.scale;
      const halfH = ((particle.size * particle.aspect) / 2) * frame.scale;
      const cos = Math.cos(frame.angle);
      const sin = Math.sin(frame.angle);
      result.moveTo(
        frame.x - halfW * cos + halfH * sin,
        frame.y - halfW * sin - halfH * cos,
      );
      result.lineTo(
        frame.x + halfW * cos + halfH * sin,
        frame.y + halfW * sin - halfH * cos,
      );
      result.lineTo(
        frame.x + halfW * cos - halfH * sin,
        frame.y + halfW * sin + halfH * cos,
      );
      result.lineTo(
        frame.x - halfW * cos - halfH * sin,
        frame.y - halfW * sin + halfH * cos,
      );
      result.close();
    }
    return result;
  });

  return (
    <Path path={path} color={color} fillType={coins ? "evenOdd" : "winding"} />
  );
});

type ParticleGroupData = {
  color: string;
  coins: boolean;
  particles: CelebrationParticle[];
};

/**
 * Builds one effect's particles and runs its clock, then reports them to the canvas that draws
 * them (and takes them back when the effect is over). Keyed by event id, so it exists per effect;
 * it draws nothing itself, so no canvas is created or destroyed per effect.
 */
const ParticleDriver = memo(function ParticleDriver({
  event,
  size,
  at,
  progress,
  onGroups,
  onDone,
}: {
  event: CelebrationEvent;
  size: LayerSize;
  /** Where the effect happens, in layer coordinates. */
  at: Point | null;
  progress: SharedValue<number>;
  onGroups: (groups: ParticleGroupData[] | null) => void;
  onDone: (id: number) => void;
}) {
  const { colors } = useTheme();

  const palette = useMemo(
    () => [
      colors.accentText,
      colors.success,
      colors.warning,
      colors.iconAccentSky,
      colors.iconAccentOrange,
      colors.danger,
    ],
    [colors],
  );

  // Built once per event (the component is keyed by event id); the layout is read at that moment.
  const [groups] = useState<ParticleGroupData[]>(() => {
    const particles =
      event.kind === "confetti" || event.kind === "confettiMedium"
        ? buildConfettiParticles({
            paletteSize: palette.length,
            width: size.width,
            height: size.height,
            origin: at ?? undefined,
            ...(event.kind === "confettiMedium"
              ? { count: MEDIUM_CONFETTI_PARTICLE_COUNT, seed: 13 }
              : {}),
          })
        : buildBurstParticles({
            paletteSize: palette.length,
            origin: at ?? { x: size.width / 2, y: size.height / 2 },
          });
    return [
      ...palette.map((color, index) => ({
        color,
        coins: false,
        particles: particles.filter(
          (p) => p.shape === "rect" && p.colorIndex === index,
        ),
      })),
      {
        color: colors.warning,
        coins: true,
        particles: particles.filter((p) => p.shape === "coin"),
      },
    ].filter((group) => group.particles.length > 0);
  });

  useEffect(() => {
    onGroups(groups);
    progress.value = 0;
    progress.value = withTiming(
      1,
      {
        duration: CELEBRATION_DURATION_MS[event.kind],
        // Linear time keeps the projectile arc physically plausible.
        easing: Easing.linear,
      },
      (finished) => {
        if (finished) {
          runOnJS(onDone)(event.id);
        }
      },
    );
    return () => onGroups(null);
  }, [groups, event.id, event.kind, onGroups, onDone, progress]);

  return null;
});

/**
 * The layer's one particle canvas. It is made once (at the first effect, or when a guided tour
 * starts and primes it) and then stays: effects only swap the particles drawn inside it. Creating
 * a GL surface is slow on weak phones and must not happen per effect.
 */
const ParticleStage = memo(function ParticleStage({
  event,
  size,
  at,
  onDone,
}: {
  /** The particle effect playing now, if any. */
  event: CelebrationEvent | null;
  size: LayerSize;
  at: Point | null;
  onDone: (id: number) => void;
}) {
  const progress = useSharedValue(1);
  const [groups, setGroups] = useState<ParticleGroupData[] | null>(null);

  return (
    <>
      {event ? (
        <ParticleDriver
          key={event.id}
          event={event}
          size={size}
          at={at}
          progress={progress}
          onGroups={setGroups}
          onDone={onDone}
        />
      ) : null}
      <Canvas style={StyleSheet.absoluteFill}>
        {(groups ?? []).map((group, index) => (
          <ParticleGroup
            key={index}
            particles={group.particles}
            color={group.color}
            coins={group.coins}
            progress={progress}
          />
        ))}
      </Canvas>
    </>
  );
});

/** The no-motion version of a celebration: a check badge that fades in and out in place. */
const CheckBadge = memo(function CheckBadge({
  event,
  size,
  at,
  onDone,
}: {
  event: CelebrationEvent;
  size: LayerSize;
  at: Point | null;
  onDone: (id: number) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withSequence(
      withTiming(1, { duration: 160 }),
      withDelay(
        CHECK_HOLD_MS,
        withTiming(0, { duration: 240 }, (finished) => {
          if (finished) {
            runOnJS(onDone)(event.id);
          }
        }),
      ),
    );
  }, [event.id, onDone, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const center = at ?? { x: size.width / 2, y: size.height / 2 };

  return (
    <Animated.View
      style={[
        styles.badge,
        {
          left: center.x - CHECK_BADGE_SIZE / 2,
          top: center.y - CHECK_BADGE_SIZE / 2,
        },
        animatedStyle,
      ]}
    >
      <Check size={28} color={colors.onSuccess} strokeWidth={3} />
    </Animated.View>
  );
});

/**
 * App-wide celebration layer: plays whatever `useCelebrationStore.celebrate` asks for, above
 * everything, without taking touches. Mount it once at the app root. Its one Skia canvas is made
 * the first time it is needed and then kept.
 */
export function CelebrationLayer() {
  const event = useCelebrationStore((s) => s.event);
  const primed = useCelebrationStore((s) => s.primed);
  const clear = useCelebrationStore((s) => s.clear);
  const setReduceMotion = useCelebrationStore((s) => s.setReduceMotion);
  const reduceMotion = useReduceMotion();
  const windowSize = useWindowDimensions();

  const rootRef = useRef<View>(null);
  const [size, setSize] = useState<LayerSize>({
    width: windowSize.width,
    height: windowSize.height,
  });
  const [origin, setOrigin] = useState<Point>({ x: 0, y: 0 });
  // The particle canvas is created once (when asked for, or at the first particle effect) and kept.
  const [canvasUp, setCanvasUp] = useState(false);
  const particleEvent = event?.mode === "particles" ? event : null;
  if (!canvasUp && (particleEvent !== null || (primed && !reduceMotion))) {
    setCanvasUp(true);
  }

  useEffect(() => {
    setReduceMotion(reduceMotion);
  }, [reduceMotion, setReduceMotion]);

  const onLayout = useCallback(
    (layout: { nativeEvent: { layout: LayerSize } }) => {
      const { width, height } = layout.nativeEvent.layout;
      setSize({ width, height });
      // Requested points are in window coordinates; learn where this layer sits in the window.
      rootRef.current?.measureInWindow((x, y) => setOrigin({ x, y }));
    },
    [],
  );

  const at = event?.at
    ? { x: event.at.x - origin.x, y: event.at.y - origin.y }
    : null;

  return (
    // The wrapper, not the Canvas, owns pointerEvents: a Skia Canvas on Android swallows touches
    // even with pointerEvents="none".
    <View
      ref={rootRef}
      collapsable={false}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      // Above the guided tour's dim layer (which sits above everything else).
      style={[StyleSheet.absoluteFill, { zIndex: 2000, elevation: 200 }]}
      onLayout={onLayout}
    >
      {canvasUp ? (
        <ParticleStage event={particleEvent} size={size} at={at} onDone={clear} />
      ) : null}
      {event && !particleEvent ? (
        <CheckBadge
          key={event.id}
          event={event}
          size={size}
          at={at}
          onDone={clear}
        />
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  badge: {
    position: "absolute",
    width: CHECK_BADGE_SIZE,
    height: CHECK_BADGE_SIZE,
    borderRadius: CHECK_BADGE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.success,
    ...shadows.fab,
  },
}));

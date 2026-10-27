import { StatusBar } from "expo-status-bar";
import { ChevronLeft, ChevronRight, X } from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type AccessibilityActionEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { relativeLuminance } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { createThemedStyles, useTheme } from "@/theme";

import { useToast } from "@/features/toast/useToast";

import { resolveReportCopy } from "../copy";
import { useStoryController } from "../hooks/useStoryController";
import type { ReportRoastLevel, ReportSlideId, ReportSnapshot } from "../types";
import { shareReportCard } from "../utils/shareReport";
import { SLIDE_TONE } from "../utils/slideTones";
import {
  resolveSlides,
  resolveTapZone,
  shouldCloseOnSwipe,
  slideDurationMs,
} from "../utils/storyLogic";
import { ClosingControls } from "./ClosingControls";
import { ShareCard } from "./ShareCard";
import { ClosingSlide } from "./slides/ClosingSlide";
import { CoverSlide } from "./slides/CoverSlide";
import { DamageSlide } from "./slides/DamageSlide";
import { LineupSlide } from "./slides/LineupSlide";
import { MomentSlide } from "./slides/MomentSlide";
import { RegularSlide } from "./slides/RegularSlide";
import { RhythmSlide } from "./slides/RhythmSlide";
import type { SlideProps } from "./slides/slideParts";
import { WinSlide } from "./slides/WinSlide";
import { StoryProgress } from "./StoryProgress";

/** Keyed by slide id, so the order of the story lives only in the snapshot's `slides`. */
const SLIDE_COMPONENTS: Record<ReportSlideId, ComponentType<SlideProps>> = {
  cover: CoverSlide,
  damage: DamageSlide,
  lineup: LineupSlide,
  regular: RegularSlide,
  moment: MomentSlide,
  rhythm: RhythmSlide,
  win: WinSlide,
  closing: ClosingSlide,
};

const ACCESSIBILITY_ACTIONS = [
  { name: "increment", label: "Next slide" },
  { name: "decrement", label: "Previous slide" },
] as const;

const CLOSE_HIT = 44;
const SHARE_FAILED_MESSAGE = "Couldn't create the image. Try again.";

/** What plays when the snapshot lists nothing playable: these three always have data. */
const FALLBACK_SLIDES: readonly ReportSlideId[] = ["cover", "damage", "closing"];

export type StoryPlayerProps = {
  snapshot: ReportSnapshot;
  level: ReportRoastLevel;
  /** The bundled preview: the cover wears a SAMPLE badge. */
  isSample?: boolean;
  onClose: () => void;
};

/**
 * The Broke Report player: full-screen slides with a segmented progress bar on top. Tap the right
 * two thirds for the next slide, the left third for the previous one, press and hold to pause,
 * swipe down to close. It never wraps: after the last slide it stays there, and "previous" on the
 * first slide restarts it. The chrome (progress, close, footer) sits above the gesture area, so
 * buttons never turn the page.
 *
 * It is keyed by the report's period, so showing another report (a link or a push opened while this
 * one is on screen) starts a fresh story: first slide, amounts hidden, nothing shared.
 */
export function StoryPlayer(props: StoryPlayerProps) {
  return <StorySession key={props.snapshot.period_key} {...props} />;
}

function StorySession({
  snapshot,
  level,
  isSample = false,
  onClose,
}: StoryPlayerProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { showToast } = useToast();

  const slides = useMemo(() => {
    const resolved = resolveSlides(snapshot);
    return resolved.length > 0 ? resolved : [...FALLBACK_SLIDES];
  }, [snapshot]);
  const durations = useMemo(() => slides.map(slideDurationMs), [slides]);
  const copy = useMemo(
    () => resolveReportCopy(snapshot, level, slides.length),
    [snapshot, level, slides.length],
  );

  const [sharing, setSharing] = useState(false);
  const [showAmounts, setShowAmounts] = useState(false);
  const cardRef = useRef<View>(null);

  const controller = useStoryController({ durations, paused: sharing });
  const {
    index,
    activeGen,
    slideGen,
    staticFrames,
    screenReader,
    goNext,
    goPrev,
    jumpTo,
    setPressHeld,
    setDragHeld,
  } = controller;

  const slideId = slides[index] ?? slides[0];
  const tone = colors.report[SLIDE_TONE[slideId]];
  const hasClosing = slides.includes("closing");

  const onShare = useCallback(async () => {
    setSharing(true);
    const result = await shareReportCard({
      cardRef,
      periodKey: snapshot.period_key,
      message: copy.closing.share,
    });
    setSharing(false);
    if (result !== "shared") {
      showToast({ message: SHARE_FAILED_MESSAGE, variant: "error" });
    }
  }, [snapshot.period_key, copy.closing.share, showToast]);

  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .runOnJS(true)
      .maxDistance(14)
      .onEnd((event, success) => {
        if (!success) {
          return;
        }
        if (resolveTapZone(event.x, width) === "previous") {
          goPrev();
        } else {
          goNext();
        }
      });
    const hold = Gesture.LongPress()
      .runOnJS(true)
      .minDuration(220)
      .maxDistance(40)
      .onStart(() => setPressHeld(true))
      .onFinalize(() => setPressHeld(false));
    const pan = Gesture.Pan()
      .runOnJS(true)
      .activeOffsetY([-9999, 14])
      .failOffsetX([-24, 24])
      .onStart(() => setDragHeld(true))
      .onEnd((event) => {
        if (shouldCloseOnSwipe(event.translationY, event.velocityY)) {
          onClose();
        }
      })
      .onFinalize(() => setDragHeld(false));
    return Gesture.Simultaneous(pan, Gesture.Exclusive(hold, tap));
  }, [goNext, goPrev, onClose, setDragHeld, setPressHeld, width]);

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === "increment") {
      goNext();
    } else if (event.nativeEvent.actionName === "decrement") {
      goPrev();
    }
  };

  // A screen reader hears the new slide as it arrives (the first one is read on focus).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (screenReader) {
      AccessibilityInfo.announceForAccessibility(
        `Slide ${index + 1} of ${slides.length}`,
      );
    }
  }, [index, screenReader, slides.length]);

  // The new slide stays invisible until the UI thread has reset the clock for it, so its final
  // frame never flashes before its entrance.
  const gateStyle = useAnimatedStyle(() => ({
    opacity: slideGen.value === activeGen ? 1 : 0,
  }));

  const Slide = SLIDE_COMPONENTS[slideId];
  const light = (relativeLuminance(tone.bg) ?? 0) > 0.5;
  const onClosing = slideId === "closing";
  const showNav = screenReader || staticFrames;

  return (
    <View style={[styles.root, { backgroundColor: tone.bg }]}>
      <StatusBar style={light ? "dark" : "light"} />

      {hasClosing ? (
        <View style={styles.shareCardHost} pointerEvents="none">
          <ShareCard
            cardRef={cardRef}
            snapshot={snapshot}
            copy={copy}
            tone={colors.report.ink}
            showAmounts={showAmounts}
          />
        </View>
      ) : null}

      <GestureDetector gesture={gesture}>
        <View
          style={StyleSheet.absoluteFill}
          accessibilityActions={ACCESSIBILITY_ACTIONS}
          onAccessibilityAction={onAccessibilityAction}
        >
          <Animated.View style={[StyleSheet.absoluteFill, gateStyle]}>
            <Slide
              key={index}
              snapshot={snapshot}
              copy={copy}
              tone={tone}
              clock={controller.clock}
              initialMs={staticFrames ? slideDurationMs(slideId) : 0}
              isSample={isSample}
              staticFrames={staticFrames}
            />
          </Animated.View>
        </View>
      </GestureDetector>

      <View
        style={[styles.top, { paddingTop: insets.top + spacing.sm }]}
        pointerEvents="box-none"
      >
        <StoryProgress
          count={slides.length}
          activeIndex={index}
          staticFrames={staticFrames}
          clock={controller.clock}
          duration={controller.duration}
          slideGen={controller.slideGen}
          activeGen={controller.activeGen}
          tone={tone}
          onSelect={jumpTo}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close report"
          hitSlop={8}
          onPress={() => {
            void triggerHaptic();
            onClose();
          }}
          style={styles.close}
        >
          <X size={24} color={tone.text} strokeWidth={2.25} />
        </Pressable>
      </View>

      <View
        style={[styles.bottom, { paddingBottom: insets.bottom + spacing.lg }]}
        pointerEvents="box-none"
      >
        {onClosing ? (
          <ClosingControls
            tone={tone}
            showAmounts={showAmounts}
            sharing={sharing}
            onToggleAmounts={() => setShowAmounts((value) => !value)}
            onShare={() => {
              void onShare();
            }}
            onDone={onClose}
          />
        ) : null}
        {showNav ? (
          <View style={styles.nav}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous slide"
              accessibilityState={{ disabled: index === 0 }}
              onPress={goPrev}
              style={[styles.navButton, { backgroundColor: tone.panel }]}
            >
              <ChevronLeft size={20} color={tone.text} strokeWidth={2.25} />
              <Text style={[styles.navText, { color: tone.text }]}>Previous</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next slide"
              accessibilityState={{ disabled: index >= slides.length - 1 }}
              onPress={goNext}
              style={[styles.navButton, { backgroundColor: tone.panel }]}
            >
              <Text style={[styles.navText, { color: tone.text }]}>Next</Text>
              <ChevronRight size={20} color={tone.text} strokeWidth={2.25} />
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(() => ({
  root: {
    flex: 1,
  },
  // Under the slide (which is opaque): laid out and drawn, so it can be captured, never seen.
  shareCardHost: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  top: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  close: {
    width: CLOSE_HIT,
    height: CLOSE_HIT,
    alignItems: "center",
    justifyContent: "center",
  },
  bottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  nav: {
    flexDirection: "row",
    gap: spacing.md,
  },
  navButton: {
    flex: 1,
    height: 48,
    borderRadius: radius.full,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  navText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
  },
}));

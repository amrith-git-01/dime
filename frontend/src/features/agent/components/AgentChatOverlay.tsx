import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Sparkles } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OPTION_BUBBLE_SIZE } from "@/components/navigation/dimeTabBarConfig";
import {
  accent,
  overlays,
  radius,
  shadow,
  spacing,
  surface,
  timings,
} from "@/constants";
import { useAgentChat } from "@/features/agent/hooks/useAgentChat";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import type { MainStackParamList } from "@/navigation/types";
import { useAddTransactionFabStore } from "@/stores/addTransactionFabStore";
import { useAgentChatUiStore } from "@/stores/agentChatUiStore";

import type { AgentDeepLink, ChatMessage } from "../types";
import { navigateAgentDeepLink } from "../utils/agentDeepLink";

import { AgentChatComposer } from "./AgentChatComposer";
import { AgentChatHeader } from "./AgentChatHeader";
import { AgentMessageRenderer } from "./AgentMessageRenderer";
import { AgentSuggestionsHeader } from "./AgentSuggestionsHeader";

const FAB_SIZE = OPTION_BUBBLE_SIZE;
const MODAL_WIDTH_RATIO = 0.92;
const MODAL_HEIGHT_RATIO = 0.72;

/** Extra lift above the tab bar (above prior `spacing.sm` gap). */
const FAB_LIFT = spacing.xl + spacing.md;

type AgentChatOverlayProps = {
  /** When false, hides the entry FAB (e.g. during tab shell bootstrap). */
  showEntryFab?: boolean;
};

export function AgentChatOverlay({
  showEntryFab = true,
}: AgentChatOverlayProps) {
  const visible = useAgentChatUiStore((s) => s.visible);
  const open = useAgentChatUiStore((s) => s.open);
  const close = useAgentChatUiStore((s) => s.close);
  const fabOpen = useAddTransactionFabStore((s) => s.fabOpen);
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const [composerResetToken, setComposerResetToken] = useState(0);
  const [overlayMounted, setOverlayMounted] = useState(false);

  const progress = useSharedValue(0);
  const isOpen = useSharedValue(0);
  const { height: keyboardHeight, progress: keyboardProgress } =
    useReanimatedKeyboardAnimation();

  const fabRight = spacing.lg;
  const fabBottom =
    spacing.tabBarHeight +
    Math.max(insets.bottom, spacing.xs) +
    spacing.lg +
    FAB_LIFT;
  const panelWidth = screenWidth * MODAL_WIDTH_RATIO;
  const panelHeight = Math.min(
    screenHeight * MODAL_HEIGHT_RATIO,
    screenHeight - insets.top - fabBottom - FAB_SIZE - spacing.xl,
  );
  /** Independent axes so collapsed visual is FAB_SIZE × FAB_SIZE (not a tall pill). */
  const collapsedScaleX = FAB_SIZE / panelWidth;
  const collapsedScaleY = FAB_SIZE / panelHeight;
  const collapsedCornerRadius = Math.min(panelWidth, panelHeight) / 2;

  /** Shared worklet value — panel's bottom anchor as keyboard animates in/out. */
  const anchorBottom = useDerivedValue(() =>
    interpolate(
      keyboardProgress.value,
      [0, 1],
      [fabBottom, spacing.md],
      "clamp",
    ),
  );

  const { messages, isPending, sendMessage, resetConversation } =
    useAgentChat();
  const stackNavigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  const scrollToBottom = useCallback(
    (animated = true) => {
      if (messages.length === 0) return;
      flatListRef.current?.scrollToEnd({ animated });
    },
    [messages.length],
  );

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => scrollToBottom(), 80);
    return () => clearTimeout(timer);
  }, [visible, messages, scrollToBottom]);

  useEffect(() => {
    if (!visible) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      clearTimeout(timer);
      timer = setTimeout(() => scrollToBottom(), 80);
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [visible, scrollToBottom]);

  useEffect(() => {
    return () => {
      close();
    };
  }, [close]);

  useEffect(() => {
    isOpen.value = visible ? 1 : 0;
    if (visible) {
      setOverlayMounted(true);
      progress.value = 0;
      progress.value = withTiming(1, timings.agentExpand);
      return;
    }
    if (!overlayMounted) {
      return;
    }
    progress.value = withTiming(0, timings.agentCollapse, (finished) => {
      if (finished) {
        runOnJS(setOverlayMounted)(false);
      }
    });
  }, [visible, overlayMounted, isOpen, progress]);

  const handleOpen = useCallback(() => {
    void triggerHaptic();
    setOverlayMounted(true);
    progress.value = 0;
    open();
  }, [open, progress]);

  const handleClose = useCallback(() => {
    close();
  }, [close]);

  const handleResetChat = useCallback(() => {
    void triggerHaptic();
    resetConversation();
    setComposerResetToken((token) => token + 1);
  }, [resetConversation]);

  const handleSend = useCallback(
    (text: string) => {
      if (isPending) {
        return;
      }
      void triggerHaptic();
      void sendMessage(text);
    },
    [isPending, sendMessage],
  );

  const handleSuggestedPrompt = useCallback(
    (prompt: string) => {
      if (isPending) {
        return;
      }
      void triggerHaptic();
      void sendMessage(prompt);
    },
    [isPending, sendMessage],
  );

  const handleDeepLink = useCallback(
    (link: AgentDeepLink) => {
      void triggerHaptic();
      navigateAgentDeepLink(link, stackNavigation);
    },
    [stackNavigation],
  );

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <AgentMessageRenderer
        role={item.role}
        content={item.content}
        blocks={item.blocks}
        deepLink={item.deepLink}
        isPending={item.isPending}
        onDeepLinkPress={handleDeepLink}
      />
    ),
    [handleDeepLink],
  );

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.35, 1], [0, 0.4, 1]),
  }));

  // `keyboardHeight.value` is 0 at rest and negative (e.g. -346) when open on both
  // iOS and Android. `keyboardProgress.value` runs 0→1 as the keyboard animates in.
  // As the keyboard opens we animate `bottom` from `fabBottom` → `spacing.md` so the
  // panel ends up sitting just above the keyboard with a small gap. Without this,
  // `bottom` stays at `fabBottom` and the visible gap equals `fabBottom` (~150 pt).
  const panelAnchorStyle = useAnimatedStyle(() => ({
    bottom: anchorBottom.value,
    transform: [{ translateY: keyboardHeight.value }],
  }));

  /**
   * Morph from bottom-right: scaleX/scaleY independently so collapsed state is a
   * square FAB (uniform scale on a tall panel leaves a vertical pill on collapse).
   */
  const panelStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const keyboardInset = Math.abs(keyboardHeight.value);
    const expandedHeight = Math.min(
      panelHeight,
      Math.max(
        FAB_SIZE,
        screenHeight -
          insets.top -
          spacing.md -
          anchorBottom.value -
          keyboardInset,
      ),
    );
    const scaleX = interpolate(p, [0, 1], [collapsedScaleX, 1], "clamp");
    const scaleY = interpolate(p, [0, 1], [collapsedScaleY, 1], "clamp");
    const borderRadius = interpolate(
      p,
      [0, 0.45, 1],
      [collapsedCornerRadius, radius.lg, radius.xl],
      "clamp",
    );
    const collapseShellFade = interpolate(p, [0, 0.1], [0, 1], "clamp");
    const opacity = isOpen.value > 0.5 ? 1 : collapseShellFade;
    return {
      width: panelWidth,
      height: expandedHeight,
      borderRadius,
      opacity,
      transform: [{ scaleX }, { scaleY }],
      transformOrigin: "bottom right",
    };
  });

  const collapsedIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.14], [1, 0], "clamp"),
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.32, 0.58], [0, 1], "clamp"),
  }));

  const showFab = showEntryFab && !overlayMounted && !fabOpen;
  /** Static circle under the morph during collapse — avoids pill artifact at the end. */
  const showCollapseHandoffFab =
    showEntryFab && overlayMounted && !visible && !fabOpen;
  const showSuggestions = messages.length === 0 && !isPending;

  return (
    <>
      {showFab || showCollapseHandoffFab ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Dime Agent"
          onPress={handleOpen}
          disabled={showCollapseHandoffFab}
          pointerEvents={showCollapseHandoffFab ? "none" : "auto"}
          style={({ pressed }) => [
            styles.fab,
            { right: fabRight, bottom: fabBottom },
            showCollapseHandoffFab && styles.fabHandoff,
            pressed && !showCollapseHandoffFab && styles.fabPressed,
          ]}
        >
          <Sparkles size={20} color={surface} strokeWidth={2} />
        </Pressable>
      ) : null}

      {overlayMounted ? (
        <View
          style={styles.overlayRoot}
          pointerEvents={visible ? "auto" : "box-none"}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Close Dime Agent"
          >
            <Animated.View
              style={[styles.backdrop, backdropStyle]}
              pointerEvents="none"
            />
          </Pressable>

          <Animated.View
            style={[styles.panelAnchor, { right: fabRight }, panelAnchorStyle]}
            pointerEvents="box-none"
          >
            <Animated.View style={[styles.panel, panelStyle]}>
              <Animated.View
                style={[styles.collapsedIcon, collapsedIconStyle]}
                pointerEvents="none"
              >
                <Sparkles size={20} color={surface} strokeWidth={2} />
              </Animated.View>

              <Animated.View style={[styles.panelInner, contentStyle]}>
                <AgentChatHeader
                  onReset={handleResetChat}
                  onClose={handleClose}
                />

                <FlatList
                  ref={flatListRef}
                  data={messages}
                  keyExtractor={keyExtractor}
                  renderItem={renderMessage}
                  style={styles.messages}
                  contentContainerStyle={styles.messagesContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  removeClippedSubviews
                  windowSize={5}
                  maxToRenderPerBatch={4}
                  initialNumToRender={10}
                  ListHeaderComponent={
                    showSuggestions ? (
                      <AgentSuggestionsHeader
                        onSelectPrompt={handleSuggestedPrompt}
                      />
                    ) : null
                  }
                />

                <AgentChatComposer
                  disabled={isPending}
                  onSend={handleSend}
                  resetToken={composerResetToken}
                />
              </Animated.View>
            </Animated.View>
          </Animated.View>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    zIndex: 40,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
  },
  fabPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  fabHandoff: {
    zIndex: 49,
  },
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: overlays.scrim,
  },
  panelAnchor: {
    position: "absolute",
    alignItems: "flex-end",
    justifyContent: "flex-end",
  },
  panel: {
    backgroundColor: surface,
    overflow: "hidden",
    shadowColor: shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 16,
  },
  collapsedIcon: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  panelInner: {
    flex: 1,
    backgroundColor: surface,
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexGrow: 1,
  },
});

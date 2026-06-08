import { SendHorizontal, Sparkles, X } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OPTION_BUBBLE_SIZE } from "@/components/navigation/dimeTabBarConfig";
import { colors, overlays, radius, spacing, timings } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { AGENT_SUGGESTED_PROMPTS } from "@/features/agent/constants/suggestedPrompts";
import { useAgentChat } from "@/features/agent/hooks/useAgentChat";
import { useAgentMessagesQuery } from "@/features/agent/hooks/useAgentMessagesQuery";
import { useAgentThreadsQuery } from "@/features/agent/hooks/useAgentThreadsQuery";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";
import { useAddTransactionFabStore } from "@/stores/addTransactionFabStore";
import { useAgentChatUiStore } from "@/stores/agentChatUiStore";

import type { AgentChatStatus, AgentDeepLink } from "../types";
import { navigateAgentDeepLink } from "../utils/agentDeepLink";

import { AgentMessageRenderer } from "./AgentMessageRenderer";

const FAB_SIZE = OPTION_BUBBLE_SIZE;
const MODAL_WIDTH_RATIO = 0.92;
const MODAL_HEIGHT_RATIO = 0.72;
/** Extra lift above the tab bar (above prior `spacing.sm` gap). */
const FAB_LIFT = spacing.xl + spacing.md;

function statusLabel(status: AgentChatStatus): string | null {
  switch (status.phase) {
    case "sql":
      return "Looking up your data…";
    case "reflect":
      return "Checking the results…";
    case "responding":
      return "Writing answer…";
    case "error":
      return status.message;
    default:
      return null;
  }
}

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
  const scrollRef = useRef<ScrollView>(null);
  const [draft, setDraft] = useState("");
  const [overlayMounted, setOverlayMounted] = useState(false);

  const progress = useSharedValue(0);
  const isOpen = useSharedValue(0);
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();

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

  const {
    threadId,
    messages,
    status,
    isStreaming,
    sendMessage,
    resetConversation,
    loadThreadHistory,
    isCreatingThread,
  } = useAgentChat();

  const threadsQuery = useAgentThreadsQuery({ enabled: visible });
  const latestThreadId = threadsQuery.data?.[0]?.id ?? null;
  const historyQuery = useAgentMessagesQuery(latestThreadId, {
    enabled:
      visible && !threadId && messages.length === 0 && Boolean(latestThreadId),
  });

  useEffect(() => {
    if (!visible || threadId || messages.length > 0) {
      return;
    }
    const rows = historyQuery.data;
    if (rows && latestThreadId && rows.length > 0) {
      loadThreadHistory(rows, latestThreadId);
    }
  }, [
    visible,
    threadId,
    messages.length,
    historyQuery.data,
    latestThreadId,
    loadThreadHistory,
  ]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [visible, messages, status]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const subscription = Keyboard.addListener("keyboardDidShow", () => {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 80);
    });
    return () => subscription.remove();
  }, [visible]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values
  }, [visible, overlayMounted]);

  const handleOpen = useCallback(() => {
    void triggerLightHaptic();
    setOverlayMounted(true);
    progress.value = 0;
    open();
  }, [open, progress]);

  const handleClose = useCallback(() => {
    close();
  }, [close]);

  const handleNewThread = useCallback(() => {
    void triggerLightHaptic();
    resetConversation();
    setDraft("");
  }, [resetConversation]);

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text || isStreaming) {
      return;
    }
    void triggerLightHaptic();
    setDraft("");
    void sendMessage(text);
  }, [draft, isStreaming, sendMessage]);

  const handleSuggestedPrompt = useCallback(
    (prompt: string) => {
      if (isStreaming) {
        return;
      }
      void triggerLightHaptic();
      void sendMessage(prompt);
    },
    [isStreaming, sendMessage],
  );

  const handleDeepLink = useCallback(
    (link: AgentDeepLink) => {
      const navigated = navigateAgentDeepLink(link);
      if (navigated) {
        close();
      }
    },
    [close],
  );

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.35, 1], [0, 0.4, 1]),
  }));

  const panelAnchorStyle = useAnimatedStyle(() => ({
    bottom: fabBottom + keyboardHeight.value,
  }));

  /**
   * Morph from bottom-right: scaleX/scaleY independently so collapsed state is a
   * square FAB (uniform scale on a tall panel leaves a vertical pill on collapse).
   */
  const panelStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const keyboardInset = keyboardHeight.value;
    const expandedHeight = Math.min(
      panelHeight,
      Math.max(
        FAB_SIZE,
        screenHeight - insets.top - fabBottom - keyboardInset - spacing.md,
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
  const statusText = statusLabel(status);
  const showSuggestions =
    messages.length === 0 && !isStreaming && !isCreatingThread;
  const composerDisabled = isStreaming || isCreatingThread;

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
          <Sparkles
            size={20}
            color={colors.headerGradientStart}
            strokeWidth={2}
          />
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
                <Sparkles
                  size={20}
                  color={colors.headerGradientStart}
                  strokeWidth={2}
                />
              </Animated.View>

              <Animated.View style={[styles.panelInner, contentStyle]}>
                <View style={styles.header}>
                  <View style={styles.headerTitleRow}>
                    <Sparkles
                      size={20}
                      color={colors.headerGradientStart}
                      strokeWidth={2}
                    />
                    <Text style={styles.headerTitle}>Dime Agent</Text>
                  </View>
                  <View style={styles.headerActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Start new chat"
                      onPress={handleNewThread}
                      hitSlop={8}
                      style={({ pressed }) => [
                        styles.newChatButton,
                        pressed && styles.newChatButtonPressed,
                      ]}
                    >
                      <Text style={styles.newChatButtonText}>New chat</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Close"
                      onPress={handleClose}
                      hitSlop={10}
                      style={styles.iconButton}
                    >
                      <X
                        size={22}
                        color={colors.textSecondary}
                        strokeWidth={2}
                      />
                    </Pressable>
                  </View>
                </View>

                <ScrollView
                  ref={scrollRef}
                  style={styles.messages}
                  contentContainerStyle={styles.messagesContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {showSuggestions ? (
                    <View style={styles.suggestions}>
                      <Text style={styles.suggestionsTitle}>
                        Ask about your money
                      </Text>
                      <View style={styles.suggestionList}>
                        {AGENT_SUGGESTED_PROMPTS.map((prompt) => (
                          <Pressable
                            key={prompt}
                            accessibilityRole="button"
                            accessibilityLabel={prompt}
                            onPress={() => handleSuggestedPrompt(prompt)}
                            style={({ pressed }) => [
                              styles.suggestionRow,
                              pressed && styles.suggestionRowPressed,
                            ]}
                          >
                            <Text style={styles.suggestionRowText}>
                              {prompt}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ) : null}

                  {messages.map((message) => (
                    <AgentMessageRenderer
                      key={message.id}
                      role={message.role}
                      content={message.content}
                      blocks={message.blocks}
                      deepLink={message.deepLink}
                      isStreaming={message.isStreaming}
                      onDeepLinkPress={handleDeepLink}
                    />
                  ))}

                  {statusText ? (
                    <View style={styles.statusRow}>
                      {status.phase !== "error" ? (
                        <ActivityIndicator
                          size="small"
                          color={colors.headerGradientStart}
                        />
                      ) : null}
                      <Text
                        style={[
                          styles.statusText,
                          status.phase === "error" && styles.statusError,
                        ]}
                      >
                        {statusText}
                      </Text>
                    </View>
                  ) : null}
                </ScrollView>

                <View style={styles.composer}>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Ask a question…"
                    placeholderTextColor={colors.textSecondary}
                    style={styles.input}
                    multiline
                    maxLength={4000}
                    editable={!composerDisabled}
                    onSubmitEditing={handleSend}
                    returnKeyType="send"
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Send message"
                    disabled={composerDisabled || draft.trim().length === 0}
                    onPress={handleSend}
                    style={({ pressed }) => [
                      styles.sendButton,
                      (composerDisabled || draft.trim().length === 0) &&
                        styles.sendButtonDisabled,
                      pressed && !composerDisabled && styles.sendButtonPressed,
                    ]}
                  >
                    {isStreaming ? (
                      <ActivityIndicator
                        size="small"
                        color={colors.barBackground}
                      />
                    ) : (
                      <SendHorizontal
                        size={20}
                        color={colors.barBackground}
                        strokeWidth={2}
                      />
                    )}
                  </Pressable>
                </View>
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
    backgroundColor: colors.barBackground,
    borderWidth: 3,
    borderColor: colors.headerGradientEnd,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.headerGradientStart,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
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
    backgroundColor: colors.barBackground,
    borderWidth: 3,
    borderColor: colors.headerGradientEnd,
    overflow: "hidden",
    shadowColor: colors.headerGradientStart,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 16,
  },
  collapsedIcon: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  panelInner: {
    flex: 1,
    backgroundColor: colors.pageBackground,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  newChatButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  newChatButtonPressed: {
    opacity: 0.7,
  },
  newChatButtonText: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    color: colors.headerGradientStart,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexGrow: 1,
  },
  suggestions: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  suggestionsTitle: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    color: colors.textSecondary,
  },
  suggestionList: {
    gap: spacing.sm,
  },
  suggestionRow: {
    width: "100%",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.barBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  suggestionRowPressed: {
    opacity: 0.85,
    backgroundColor: colors.surfaceTint,
  },
  suggestionRowText: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  statusText: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    color: colors.textSecondary,
    flex: 1,
  },
  statusError: {
    color: colors.danger,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.cardBorder,
    backgroundColor: colors.barBackground,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.pageBackground,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    color: colors.textPrimary,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.headerGradientStart,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
  sendButtonPressed: {
    opacity: 0.85,
  },
});

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { ScreenSectionHeader } from "@/components/shared";
import { useCardSlotEmpty } from "@/features/cardLayout/components/CardSlot";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { springs } from "@/constants/motion";
import { spacing } from "@/constants/spacing";
import { openToursSettings } from "@/features/appTour";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useCelebrationStore } from "@/stores/celebrationStore";
import { createThemedStyles } from "@/theme";

import { CHECKLIST_ITEM_COUNT } from "../constants/checklistItems";
import { useGetStartedChecklist } from "../hooks/useGetStartedChecklist";
import type { ChecklistItemId } from "../types";

import { ChecklistProgressBar } from "./ChecklistProgressBar";
import { ChecklistRow } from "./ChecklistRow";
import { WidgetHowToModal } from "./WidgetHowToModal";

/** The checks stay "just done" this long, then the rows settle to static checks. */
const JUST_DONE_MS = 1200;
const PRO_FADE_MS = 200;

export type GetStartedCardActions = {
  onManualAdd: () => void;
  onVoice: () => void;
  onSetBudget: () => void;
  onAddRecurring: () => void;
  onAskAi: () => void;
};

/** Home "Get started" checklist: six real actions, ticked from the user's data. Renders nothing when it should not show. */
export const GetStartedCard = memo(function GetStartedCard({
  onManualAdd,
  onVoice,
  onSetBudget,
  onAddRecurring,
  onAskAi,
}: GetStartedCardActions) {
  const styles = useStyles();
  const reduceMotion = useReduceMotion();
  const checklist = useGetStartedChecklist();
  const { clearJustDone } = checklist;
  const [howToVisible, setHowToVisible] = useState(false);

  // Rows animate their check for a moment, then go back to the plain check.
  useEffect(() => {
    if (checklist.justDone.length === 0) {
      return;
    }
    const timer = setTimeout(clearJustDone, JUST_DONE_MS);
    return () => clearTimeout(timer);
  }, [checklist.justDone, clearJustDone]);

  const onRowPress = useCallback(
    (id: ChecklistItemId) => {
      switch (id) {
        case "firstExpense":
          onManualAdd();
          break;
        case "voiceOrScan":
          onVoice();
          break;
        case "budget":
          onSetBudget();
          break;
        case "recurring":
          onAddRecurring();
          break;
        case "widget":
          setHowToVisible(true);
          break;
        case "askAi":
          onAskAi();
          break;
      }
    },
    [onManualAdd, onVoice, onSetBudget, onAddRecurring, onAskAi],
  );

  // Its slot in the arranged cards takes no space once the checklist is gone.
  useCardSlotEmpty(!checklist.visible);
  if (!checklist.visible) {
    return null;
  }

  const burstId = checklist.justDone[0];

  return (
    <View>
      <ScreenSectionHeader
        title="Get started"
        action={
          <View
            style={styles.countPill}
            accessible
            accessibilityLabel={`${checklist.doneCount} of ${checklist.total} done`}
          >
            <Text style={styles.countText}>
              {checklist.doneCount} of {checklist.total}
            </Text>
          </View>
        }
      />
      {checklist.proShowing ? (
        <ProCard reduceMotion={reduceMotion} />
      ) : (
        <View style={styles.card}>
          <View style={styles.progress}>
            <ChecklistProgressBar
              total={CHECKLIST_ITEM_COUNT}
              done={checklist.doneCount}
              reduceMotion={reduceMotion}
            />
          </View>
          {checklist.items.map((id) => (
            <View key={id}>
              <View style={styles.divider} />
              <ChecklistRow
                id={id}
                done={checklist.done[id]}
                animateCheck={checklist.justDone.includes(id)}
                burst={id === burstId}
                reduceMotion={reduceMotion}
                onPress={onRowPress}
              />
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Take a tour"
              onPress={openToursSettings}
              hitSlop={8}
              style={styles.footerButton}
            >
              <Text style={styles.footerLink}>Take a tour</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Hide the Get started checklist"
              onPress={checklist.hide}
              hitSlop={8}
              style={styles.footerButton}
            >
              <Text style={styles.footerMuted}>Hide</Text>
            </Pressable>
          </View>
        </View>
      )}
      <WidgetHowToModal
        visible={howToVisible}
        onClose={() => setHowToVisible(false)}
      />
    </View>
  );
});

/** "You're a Dime pro": one burst over the card and a short thank-you, before the card retires. */
function ProCard({ reduceMotion }: { reduceMotion: boolean }) {
  const styles = useStyles();
  const cardRef = useRef<View>(null);
  const enter = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    enter.value = reduceMotion
      ? withTiming(1, { duration: PRO_FADE_MS })
      : withSpring(1, springs.bouncy);
  }, [enter, reduceMotion]);

  // The burst plays once, over the middle of the card.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      cardRef.current?.measureInWindow((x, y, width, height) => {
        useCelebrationStore.getState().celebrate({
          kind: "burst",
          at: { x: x + width / 2, y: y + height / 2 },
        });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, enter.value * 1.5),
    transform: [{ scale: reduceMotion ? 1 : 0.96 + enter.value * 0.04 }],
  }));

  return (
    <View ref={cardRef} collapsable={false}>
      <Animated.View
        style={[styles.card, styles.proCard, animatedStyle]}
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel="You're a Dime pro. Everything on the list is done."
      >
        <Text style={styles.proTitle}>You&apos;re a Dime pro</Text>
        <Text style={styles.proBody}>
          Everything on the list is done. Dime keeps tracking from here.
        </Text>
      </Animated.View>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  countPill: {
    backgroundColor: colors.accentTint,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  countText: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.accentText,
    fontVariant: ["tabular-nums"],
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadows.card,
  },
  progress: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginHorizontal: spacing.lg,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    // Left-aligned: the floating buttons sit over the bottom-right of the screen.
    justifyContent: "flex-start",
    gap: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  footerButton: {
    minHeight: 44,
    justifyContent: "center",
  },
  footerLink: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.accentText,
  },
  footerMuted: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  proCard: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  proTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.ink,
  },
  proBody: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
    textAlign: "center",
  },
}));

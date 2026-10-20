import { memo } from "react";
import { Text, View } from "react-native";

import {
  BENTO_FORM_BODY_GAP,
  BENTO_FORM_SECTION_PADDING,
} from "@/components/bento";
import { TwoToneCard } from "@/components/shared";
import { Button, SegmentChip, TextField } from "@/components/ui";
import { spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { GOAL_OPTIONS } from "@/features/onboarding/utils/goalInput";
import type { OnboardingGoal } from "@/features/onboarding/types";
import { createThemedStyles } from "@/theme";

export type ProfileGoalStepProps = {
  goal: OnboardingGoal | null;
  budgetText: string;
  fieldError: string | null;
  disabled?: boolean;
  continueLoading?: boolean;
  onGoalChange: (goal: OnboardingGoal) => void;
  onBudgetTextChange: (text: string) => void;
  onBack: () => void;
  onContinue: () => void;
  onSkip: () => void;
};

/** Second step of profile setup: "What do you want from Dime?" Skippable; it only changes what Dime shows first. */
export const ProfileGoalStep = memo(function ProfileGoalStep({
  goal,
  budgetText,
  fieldError,
  disabled = false,
  continueLoading = false,
  onGoalChange,
  onBudgetTextChange,
  onBack,
  onContinue,
  onSkip,
}: ProfileGoalStepProps) {
  const styles = useStyles();
  return (
    <TwoToneCard
      header={
        <View style={styles.headerInner}>
          <Text style={styles.headerTitle}>What do you want from Dime?</Text>
          <Text style={styles.headerSubtitle}>
            This only decides what we show first. You can change anything later.
          </Text>
        </View>
      }
      body={
        <View style={styles.bodyInner}>
          <View style={styles.options}>
            {GOAL_OPTIONS.map((option) => (
              <SegmentChip
                key={option.goal}
                label={option.label}
                selected={goal === option.goal}
                onPress={() => onGoalChange(option.goal)}
              />
            ))}
          </View>
          {goal === "budget" ? (
            <TextField
              label="Monthly budget in ₹ (optional)"
              value={budgetText}
              onChangeText={onBudgetTextChange}
              keyboardType="number-pad"
              placeholder="For example 30000"
              editable={!disabled}
              showClear
            />
          ) : null}
          {fieldError ? <Text style={styles.error}>{fieldError}</Text> : null}
          <View style={styles.actionsRow}>
            <View style={styles.actionButtonWrap}>
              <Button
                title="Back"
                variant="secondary"
                disabled={disabled}
                onPress={onBack}
              />
            </View>
            <View style={styles.actionButtonWrap}>
              <Button
                title="Continue"
                loading={continueLoading}
                disabled={disabled || goal === null}
                onPress={onContinue}
              />
            </View>
          </View>
          <Button
            title="Skip for now"
            variant="ghost"
            disabled={disabled}
            onPress={onSkip}
          />
        </View>
      }
    />
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  headerInner: {
    padding: BENTO_FORM_SECTION_PADDING,
    gap: spacing.xs,
  },
  headerTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.ink,
  },
  headerSubtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkFaint,
  },
  bodyInner: {
    padding: BENTO_FORM_SECTION_PADDING,
    gap: BENTO_FORM_BODY_GAP,
  },
  options: {
    gap: spacing.sm,
  },
  error: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.danger,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  actionButtonWrap: {
    flex: 1,
  },
}));

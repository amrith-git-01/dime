import { memo, useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { TextField } from "@/components/ui";
import { fontFamilies, spacing } from "@/constants";
import {
  BUDGET_CUSTOM_STEP_INDEX,
  BudgetAmountStepSlider,
} from "@/features/budgets/components";

import {
  WARN_PCT_CUSTOM_STEP_INDEX,
  WARN_PCT_MAX,
  WARN_PCT_MIN,
  WARN_PCT_PRESETS,
  clampWarnPct,
  warnPctFromStep,
  warnPctStepIndex,
} from "../utils/warnPctPresets";
import { SettingsToggleRow } from "./SettingsToggleRow";
import { createThemedStyles } from "@/theme";

export type BudgetAlertScopeBlockProps = {
  label: string;
  subtitle: string;
  enabled: boolean;
  warnPct: number;
  /** Master budget alerts off or save-in-flight — locks scope toggle too. */
  disabled?: boolean;
  /** Bump on Clear so Custom slider state resyncs even when % unchanged. */
  syncKey?: number;
  onEnabledChange: (enabled: boolean) => void;
  onWarnPctChange: (pct: number) => void;
  onAnimationBusyChange?: (busy: boolean) => void;
  showSeparator?: boolean;
};

export const BudgetAlertScopeBlock = memo(function BudgetAlertScopeBlock({
  label,
  subtitle,
  enabled,
  warnPct,
  disabled = false,
  syncKey = 0,
  onEnabledChange,
  onWarnPctChange,
  onAnimationBusyChange,
  showSeparator = false,
}: BudgetAlertScopeBlockProps) {
  const styles = useStyles();
  const stepIndex = warnPctStepIndex(warnPct);
  const [forceCustom, setForceCustom] = useState(
    () => stepIndex === WARN_PCT_CUSTOM_STEP_INDEX,
  );
  const isCustom = forceCustom || stepIndex === WARN_PCT_CUSTOM_STEP_INDEX;
  const [customText, setCustomText] = useState(String(warnPct));

  useEffect(() => {
    setCustomText(String(warnPct));
    setForceCustom(warnPctStepIndex(warnPct) === WARN_PCT_CUSTOM_STEP_INDEX);
  }, [warnPct, syncKey]);

  const handleStepChange = useCallback(
    (index: number) => {
      if (index === BUDGET_CUSTOM_STEP_INDEX) {
        const next = clampWarnPct(warnPct);
        setForceCustom(true);
        setCustomText(String(next));
        onWarnPctChange(next);
        return;
      }
      setForceCustom(false);
      onWarnPctChange(warnPctFromStep(index, warnPct));
    },
    [onWarnPctChange, warnPct],
  );

  const handleCustomChange = useCallback(
    (text: string) => {
      const digits = text.replace(/[^\d]/g, "");
      setCustomText(digits);
      if (digits.length === 0) {
        return;
      }
      onWarnPctChange(clampWarnPct(Number(digits)));
    },
    [onWarnPctChange],
  );

  const sectionInactive = disabled || !enabled;
  const pctLocked = sectionInactive;

  return (
    <View style={[styles.block, sectionInactive && styles.blockDimmed]}>
      <SettingsToggleRow
        label={label}
        subtitle={subtitle}
        value={enabled}
        onValueChange={onEnabledChange}
        disabled={disabled}
        onAnimationBusyChange={onAnimationBusyChange}
        showSeparator={false}
      />

      <View style={styles.pctBlock} pointerEvents={pctLocked ? "none" : "auto"}>
        <BudgetAmountStepSlider
          label="Warn at"
          presets={WARN_PCT_PRESETS}
          stepIndex={isCustom ? BUDGET_CUSTOM_STEP_INDEX : stepIndex}
          onStepChange={handleStepChange}
        />
        {isCustom ? (
          <TextField
            label="Custom %"
            value={customText}
            onChangeText={handleCustomChange}
            keyboardType="number-pad"
            maxLength={2}
            showClear={false}
            editable={!pctLocked}
          />
        ) : null}
        <Text style={styles.hint}>
          Also alerts when you go over 100%. Range {WARN_PCT_MIN}–{WARN_PCT_MAX}
          %.
        </Text>
      </View>

      {showSeparator ? <View style={styles.separator} /> : null}
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  block: {
    gap: spacing.sm,
  },
  blockDimmed: {
    opacity: 0.45,
  },
  pctBlock: {
    gap: spacing.sm,
    paddingLeft: spacing.xs,
    paddingBottom: spacing.sm,
  },
  hint: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
  },
}));

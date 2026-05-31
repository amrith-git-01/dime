import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatInrCompact } from "@/utils/currency";

import {
  BUDGET_CUSTOM_STEP_INDEX,
  BUDGET_UNSET_STEP_INDEX,
  findPresetStepIndex,
  formatBudgetAmountText,
  parsePositiveBudgetAmount,
  presetAmountForStep,
  type BudgetPresetList,
} from "./budgetEditorPresets";

export function useBudgetLimitStepControl(
  presets: BudgetPresetList,
  seededAmount: number,
  hasSeededAmount: boolean,
) {
  const initialStep = useMemo(() => {
    if (!hasSeededAmount || seededAmount <= 0) {
      return BUDGET_UNSET_STEP_INDEX;
    }
    return findPresetStepIndex(seededAmount, presets);
  }, [hasSeededAmount, presets, seededAmount]);

  const initialText = useMemo(() => {
    if (!hasSeededAmount || seededAmount <= 0) {
      return "0";
    }
    if (initialStep === BUDGET_CUSTOM_STEP_INDEX) {
      return formatBudgetAmountText(seededAmount);
    }
    if (initialStep === BUDGET_UNSET_STEP_INDEX) {
      return "0";
    }
    const preset = presetAmountForStep(initialStep, presets);
    return preset !== null ? formatBudgetAmountText(preset) : "0";
  }, [hasSeededAmount, initialStep, presets, seededAmount]);

  const [stepIndex, setStepIndex] = useState(initialStep);
  const [valueText, setValueText] = useState(initialText);
  const stepIndexRef = useRef(stepIndex);
  stepIndexRef.current = stepIndex;

  const isCustom = stepIndex === BUDGET_CUSTOM_STEP_INDEX;

  const displayAmount = useMemo(() => {
    if (isCustom) {
      const parsed = parsePositiveBudgetAmount(valueText);
      if (valueText.trim().length === 0) {
        return "";
      }
      return parsed !== null ? formatInrCompact(parsed) : "";
    }
    const preset = presetAmountForStep(stepIndex, presets);
    return formatInrCompact(preset ?? 0);
  }, [isCustom, presets, stepIndex, valueText]);

  const selectStep = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(BUDGET_CUSTOM_STEP_INDEX, index));
      const prevStep = stepIndexRef.current;
      const enteringCustom =
        clamped === BUDGET_CUSTOM_STEP_INDEX &&
        prevStep !== BUDGET_CUSTOM_STEP_INDEX;

      if (enteringCustom) {
        setValueText("");
      } else if (clamped !== BUDGET_CUSTOM_STEP_INDEX) {
        const preset = presetAmountForStep(clamped, presets);
        setValueText(preset !== null ? formatBudgetAmountText(preset) : "0");
      }

      setStepIndex(clamped);
    },
    [presets],
  );

  const resetToUnset = useCallback(() => {
    setStepIndex(BUDGET_UNSET_STEP_INDEX);
    setValueText("0");
  }, []);

  const onChangeText = useCallback((text: string) => {
    setStepIndex(BUDGET_CUSTOM_STEP_INDEX);
    setValueText(text);
  }, []);

  useEffect(() => {
    if (!hasSeededAmount || seededAmount <= 0) {
      setStepIndex(BUDGET_UNSET_STEP_INDEX);
      setValueText("0");
      return;
    }
    const step = findPresetStepIndex(seededAmount, presets);
    setStepIndex(step);
    if (step === BUDGET_CUSTOM_STEP_INDEX) {
      setValueText(formatBudgetAmountText(seededAmount));
      return;
    }
    if (step === BUDGET_UNSET_STEP_INDEX) {
      setValueText("0");
      return;
    }
    const preset = presetAmountForStep(step, presets);
    setValueText(preset !== null ? formatBudgetAmountText(preset) : "0");
  }, [hasSeededAmount, presets, seededAmount]);

  return {
    stepIndex,
    isCustom,
    valueText,
    displayAmount,
    selectStep,
    onChangeText,
    resetToUnset,
  };
}

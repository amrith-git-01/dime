import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { BackHandler } from "react-native";

import { upsertBudget } from "@/features/budgets/api/budgetsApi";
import { invalidateBudgetAlertQueries } from "@/features/budgets/cache/invalidateBudgetQueries";
import { budgetQueryKeys } from "@/features/budgets/queryKeys";
import type { OnboardingGoal } from "@/features/onboarding/types";
import {
  resolveGoalSubmission,
  sanitizeBudgetInput,
} from "@/features/onboarding/utils/goalInput";
import { useConfirmSignOut } from "@/features/auth/hooks/useConfirmSignOut";
import { useSaveProfileMutation } from "@/features/profile/hooks/useSaveProfileMutation";
import { useProfileSetup } from "@/hooks/useProfileSetup";
import { parseFastApiError } from "@/lib/api/parseFastApiError";
import { uploadProfileAvatarFromUrl } from "@/lib/api/uploadProfileAvatar";
import { setStoredGoal } from "@/lib/onboarding/goalStorage";
import { useSessionUserId } from "@/hooks/useSessionUserId";

/** `profile`: avatar and username. `goal`: "What do you want from Dime?" (saved together with the profile). */
export type ProfileSetupStep = "profile" | "goal";

export function useProfileSetupScreenModel() {
  const { avatarUrl, refreshAvatarSeed, username, setUsername, validation } =
    useProfileSetup();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(
    null,
  );

  const [step, setStep] = useState<ProfileSetupStep>("profile");
  const [goal, setGoal] = useState<OnboardingGoal | null>(null);
  const [budgetText, setBudgetText] = useState("");
  const queryClient = useQueryClient();
  const { userId } = useSessionUserId();

  const saveProfileMutation = useSaveProfileMutation();
  const { confirmSignOut, signOutLoading, signOutConfirmModalProps } =
    useConfirmSignOut();

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          if (step === "goal") {
            setStep("profile");
          } else {
            confirmSignOut();
          }
          return true;
        },
      );
      return () => subscription.remove();
    }, [confirmSignOut, step]),
  );

  const handleUsernameChange = useCallback(
    (text: string) => {
      setUsername(text);
      saveProfileMutation.reset();
      setAvatarUploadError(null);
    },
    [saveProfileMutation, setUsername],
  );

  // Saving the profile is what moves the app on to Home, so the goal (and its budget) are saved first.
  const handleFinish = useCallback(
    async (skip: boolean) => {
      try {
        setAvatarUploadError(null);
        setUploadingAvatar(true);
        const { avatar_url: uploadedAvatarUrl } =
          await uploadProfileAvatarFromUrl(avatarUrl);
        const { stored, budgetAmount } = resolveGoalSubmission(
          goal,
          budgetText,
          skip,
        );
        if (userId && stored) {
          setStoredGoal(userId, stored);
        }
        if (budgetAmount) {
          // Straight to the API (not the mutation hook, which would ask for notifications mid-setup).
          // A failure is not fatal: the amount stays stored and the budget screens offer it.
          try {
            await upsertBudget({ monthlyAmount: budgetAmount });
            void queryClient.invalidateQueries({
              queryKey: budgetQueryKeys.all,
            });
            invalidateBudgetAlertQueries(queryClient);
          } catch {
            // offered again from the budget screens
          }
        }
        await saveProfileMutation.mutateAsync({
          username: username.trim(),
          currency: "INR",
          avatarUrl: uploadedAvatarUrl,
        });
      } catch (error) {
        setAvatarUploadError(parseFastApiError(error));
      } finally {
        setUploadingAvatar(false);
      }
    },
    [
      avatarUrl,
      budgetText,
      goal,
      queryClient,
      saveProfileMutation,
      userId,
      username,
    ],
  );

  const handleGoalChange = useCallback((next: OnboardingGoal) => {
    setGoal(next);
    setAvatarUploadError(null);
  }, []);

  const fieldError = useMemo(() => {
    if (avatarUploadError) {
      return avatarUploadError;
    }
    if (saveProfileMutation.error) {
      return parseFastApiError(saveProfileMutation.error);
    }
    return null;
  }, [avatarUploadError, saveProfileMutation.error]);

  const busy =
    saveProfileMutation.isPending || uploadingAvatar || signOutLoading;

  const saving = saveProfileMutation.isPending || uploadingAvatar;

  return {
    step,
    goal,
    budgetText,
    avatarUrl,
    username,
    validation,
    fieldError,
    disabled: busy,
    continueLoading: saving,
    continueDisabled: busy || !validation.isValid,
    onGoalChange: handleGoalChange,
    onBudgetTextChange: (text: string) =>
      setBudgetText(sanitizeBudgetInput(text)),
    onProfileContinue: () => setStep("goal"),
    onGoalBack: () => setStep("profile"),
    onGoalContinue: () => void handleFinish(false),
    onGoalSkip: () => void handleFinish(true),
    signOutLoading,
    signOutDisabled: saving,
    signOutConfirmModalProps,
    onUsernameChange: handleUsernameChange,
    onRefreshRandom: refreshAvatarSeed,
    onSignOut: confirmSignOut,
  };
}

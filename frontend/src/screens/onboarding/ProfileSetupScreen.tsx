import { StackScreenShell } from "@/components/layout/StackScreenShell";
import { ConfirmModal } from "@/components/shared";
import { ProfileGoalStep, ProfileSetupEditor } from "@/features/profile/components";

import { useProfileSetupScreenModel } from "./useProfileSetupScreenModel";

export default function ProfileSetupScreen() {
  const model = useProfileSetupScreenModel();

  return (
    <StackScreenShell contentContainerStyle={shellContentStyle}>
      {model.step === "profile" ? (
        <ProfileSetupEditor
          avatarUrl={model.avatarUrl}
          username={model.username}
          validation={model.validation}
          fieldError={null}
          disabled={model.disabled}
          continueDisabled={model.continueDisabled}
          signOutLoading={model.signOutLoading}
          signOutDisabled={model.signOutDisabled}
          onUsernameChange={model.onUsernameChange}
          onRefreshRandom={model.onRefreshRandom}
          onContinue={model.onProfileContinue}
          onSignOut={model.onSignOut}
        />
      ) : (
        <ProfileGoalStep
          goal={model.goal}
          budgetText={model.budgetText}
          fieldError={model.fieldError}
          disabled={model.disabled}
          continueLoading={model.continueLoading}
          onGoalChange={model.onGoalChange}
          onBudgetTextChange={model.onBudgetTextChange}
          onBack={model.onGoalBack}
          onContinue={model.onGoalContinue}
          onSkip={model.onGoalSkip}
        />
      )}
      <ConfirmModal
        {...model.signOutConfirmModalProps}
        title="Sign out?"
        message="You'll need to sign in again to use the app."
        cancelLabel="Cancel"
        confirmLabel="Sign out"
        confirmTone="danger"
      />
    </StackScreenShell>
  );
}

const shellContentStyle = {
  flexGrow: 1,
  justifyContent: "center" as const,
};

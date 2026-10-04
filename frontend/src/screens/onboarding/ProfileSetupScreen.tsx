import { StackScreenShell } from "@/components/layout/StackScreenShell";
import { ConfirmModal } from "@/components/shared";
import { ProfileSetupEditor } from "@/features/profile/components";

import { useProfileSetupScreenModel } from "./useProfileSetupScreenModel";

export default function ProfileSetupScreen() {
  const model = useProfileSetupScreenModel();

  return (
    <StackScreenShell contentContainerStyle={shellContentStyle}>
      <ProfileSetupEditor
        avatarUrl={model.avatarUrl}
        username={model.username}
        validation={model.validation}
        fieldError={model.fieldError}
        disabled={model.disabled}
        continueLoading={model.continueLoading}
        continueDisabled={model.continueDisabled}
        signOutLoading={model.signOutLoading}
        signOutDisabled={model.signOutDisabled}
        onUsernameChange={model.onUsernameChange}
        onRefreshRandom={model.onRefreshRandom}
        onContinue={model.onContinue}
        onSignOut={model.onSignOut}
      />
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

import { StackScreenShell } from "@/components/layout/StackScreenShell";
import { spacing } from "@/constants";
import { PermissionsSetupEditor } from "@/features/onboarding/components/PermissionsSetupEditor";
import { usePermissionsSetupScreenModel } from "@/features/onboarding/hooks/usePermissionsSetupScreenModel";

const shellContentStyle = {
  paddingHorizontal: spacing.md,
  paddingTop: spacing.lg,
};

export default function PermissionsSetupScreen() {
  const model = usePermissionsSetupScreenModel();

  return (
    <StackScreenShell contentContainerStyle={shellContentStyle}>
      <PermissionsSetupEditor {...model} />
    </StackScreenShell>
  );
}

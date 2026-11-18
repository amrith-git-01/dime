import { useCallback } from "react";

import { useUpdateUserSettingsMutation } from "@/features/settings/hooks/useUpdateUserSettingsMutation";
import { useUserSettingsQuery } from "@/features/settings/hooks/useUserSettingsQuery";
import { useToast } from "@/features/toast/useToast";
import { parseFastApiError } from "@/lib/api/parseFastApiError";

/** The "What counts as spending" card on Budgets: the cash-withdrawal switch saves the moment it is flipped. */
export function useMoneyRulesCardModel() {
  const { showToast } = useToast();
  const settings = useUserSettingsQuery();
  const { mutateAsync, isPending } = useUpdateUserSettingsMutation();

  const onCountCashWithdrawalsChange = useCallback(
    async (enabled: boolean) => {
      try {
        // The settings mutation refetches everything the new rule changes (Home, the month summary, Insights, alerts).
        await mutateAsync({ countCashWithdrawalsAsSpend: enabled });
      } catch (error: unknown) {
        showToast({
          variant: "error",
          message: parseFastApiError(error) || "Could not save that setting.",
        });
      }
    },
    [mutateAsync, showToast],
  );

  return {
    countCashWithdrawalsAsSpend: settings.data?.countCashWithdrawalsAsSpend ?? false,
    // Until the settings load there is nothing to show the real value of.
    disabled: isPending || settings.data === undefined,
    onCountCashWithdrawalsChange: (enabled: boolean) => void onCountCashWithdrawalsChange(enabled),
  };
}

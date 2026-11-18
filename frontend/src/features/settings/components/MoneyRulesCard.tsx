import { memo } from "react";

import { SettingsFormCard } from "./SettingsFormCard";
import { SettingsToggleRow } from "./SettingsToggleRow";

export type MoneyRulesCardProps = {
  countCashWithdrawalsAsSpend: boolean;
  /** Until the settings load there is nothing to show: the switch is locked. */
  disabled?: boolean;
  onCountCashWithdrawalsChange: (enabled: boolean) => void;
};

/**
 * Budgets: how Dime counts money that is not everyday spending. Cash withdrawals are transfers by default (the money
 * is still yours); the switch counts them as spending instead. It saves as soon as it is flipped.
 */
export const MoneyRulesCard = memo(function MoneyRulesCard({
  countCashWithdrawalsAsSpend,
  disabled = false,
  onCountCashWithdrawalsChange,
}: MoneyRulesCardProps) {
  return (
    <SettingsFormCard
      title="What counts as spending"
      subtitle="Transfers between your own accounts and card bill payments never count."
    >
      <SettingsToggleRow
        label="Count cash withdrawals as spending"
        subtitle="Off: an ATM withdrawal is a transfer, and what you spend the cash on counts. On: the withdrawal counts when you take it out."
        value={countCashWithdrawalsAsSpend}
        disabled={disabled}
        onValueChange={onCountCashWithdrawalsChange}
      />
    </SettingsFormCard>
  );
});

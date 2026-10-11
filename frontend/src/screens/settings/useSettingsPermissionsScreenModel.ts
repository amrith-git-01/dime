import {
  PERMISSION_HELP_GROUPS,
  PERMISSION_HELP_INTRO,
} from "@/features/settings/constants/permissionHelp";
import { useHelpAccordionExpand } from "@/features/settings/hooks/useHelpAccordionExpand";

export function useSettingsPermissionsScreenModel() {
  const { expandedIds, onToggleTerm } = useHelpAccordionExpand();

  return {
    intro: PERMISSION_HELP_INTRO,
    groups: PERMISSION_HELP_GROUPS,
    expandedIds,
    onToggleTerm,
  };
}

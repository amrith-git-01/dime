import {
  GLOSSARY_GROUPS,
  GLOSSARY_INTRO,
} from "@/features/settings/constants/glossaryTerms";
import { useHelpAccordionExpand } from "@/features/settings/hooks/useHelpAccordionExpand";

export function useSettingsGlossaryScreenModel() {
  const { expandedIds, onToggleTerm } = useHelpAccordionExpand();

  return {
    intro: GLOSSARY_INTRO,
    groups: GLOSSARY_GROUPS,
    expandedIds,
    onToggleTerm,
  };
}

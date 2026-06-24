import { useCallback, useState } from "react";

import {
  GLOSSARY_GROUPS,
  GLOSSARY_INTRO,
} from "@/features/settings/constants/glossaryTerms";

export function useSettingsGlossaryScreenModel() {
  const [expandedTermId, setExpandedTermId] = useState<string | null>(null);

  const onToggleTerm = useCallback((id: string) => {
    setExpandedTermId((current) => (current === id ? null : id));
  }, []);

  return {
    intro: GLOSSARY_INTRO,
    groups: GLOSSARY_GROUPS,
    expandedTermId,
    onToggleTerm,
  };
}

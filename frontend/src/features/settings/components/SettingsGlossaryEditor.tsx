import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { fontFamilies, inkSoft } from "@/constants";

import type { HelpAccordionGroup } from "../constants/helpAccordion";
import { SETTINGS_SECTION_GAP } from "../constants/settingsTokens";
import { GlossaryTermRow } from "./GlossaryTermRow";
import { SettingsSection } from "./SettingsSection";

export type SettingsGlossaryEditorProps = {
  intro: string;
  groups: readonly HelpAccordionGroup[];
  expandedIds: ReadonlySet<string>;
  onToggleTerm: (id: string) => void;
};

export const SettingsGlossaryEditor = memo(function SettingsGlossaryEditor({
  intro,
  groups,
  expandedIds,
  onToggleTerm,
}: SettingsGlossaryEditorProps) {
  return (
    <View style={styles.root}>
      <Text style={styles.intro}>{intro}</Text>
      {groups.map((group) => (
        <SettingsSection key={group.id} title={group.title}>
          {group.terms.map((item, index) => (
            <GlossaryTermRow
              key={item.id}
              id={item.id}
              term={item.term}
              description={item.description}
              expanded={expandedIds.has(item.id)}
              onToggle={onToggleTerm}
              showSeparator={index < group.terms.length - 1}
            />
          ))}
        </SettingsSection>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    gap: SETTINGS_SECTION_GAP,
  },
  intro: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: inkSoft,
  },
});

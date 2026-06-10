import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BENTO_SECTION_HEADER_GAP } from "@/components/bento";
import { BentoActionPill } from "@/components/shared";
import { typography } from "@/constants";

export type BentoSectionHeaderProps = {
  title: string;
  viewAllLabel?: string;
  onViewAll: () => void;
};

/** Section title + pill "View all" for Home bento sections. */
export const BentoSectionHeader = memo(function BentoSectionHeader({
  title,
  viewAllLabel = "View all",
  onViewAll,
}: BentoSectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      <BentoActionPill
        label={viewAllLabel}
        onPress={onViewAll}
        accessibilityLabel={`${viewAllLabel} ${title}`}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: BENTO_SECTION_HEADER_GAP,
  },
  title: {
    ...typography.sectionTitle,
  },
});

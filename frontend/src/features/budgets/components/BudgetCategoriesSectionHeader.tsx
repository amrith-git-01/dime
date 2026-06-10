import { Plus } from "lucide-react-native";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BENTO_SECTION_HEADER_GAP } from "@/components/bento";
import { BentoActionPill } from "@/components/shared";
import { spacing, typography } from "@/constants";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";

type BudgetCategoriesSectionHeaderProps = {
  onAddPress: () => void;
  addDisabled: boolean;
};

export const BudgetCategoriesSectionHeader = memo(
  function BudgetCategoriesSectionHeader({
    onAddPress,
    addDisabled,
  }: BudgetCategoriesSectionHeaderProps) {
    return (
      <View style={styles.row}>
        <Text style={styles.title}>All categories</Text>
        <BentoActionPill
          label="Add"
          icon={Plus}
          accessibilityLabel="Add custom category"
          disabled={addDisabled}
          onPress={() => {
            void triggerLightHaptic();
            onAddPress();
          }}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: BENTO_SECTION_HEADER_GAP,
  },
  title: {
    ...typography.sectionTitle,
    flex: 1,
    marginRight: spacing.sm,
  },
});

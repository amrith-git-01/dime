import { ChevronRight } from "lucide-react-native";
import { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { bento, colors, spacing, typography } from "@/constants/theme";

import { BentoCategoryTile } from "./BentoCategoryTile";
import { BentoQuickAddPills } from "./BentoQuickAddPills";
import { BentoSectionCard } from "./BentoSectionCard";
import {
  HOME_BENTO_GAP,
  HOME_MAX_CATEGORIES,
  HOME_SECTION_HEADER_GAP,
} from "./homeBentoTokens";
import type { HomeCategoryBentoItem } from "./types";

type HomeCategoriesBentoProps = {
  items: HomeCategoryBentoItem[];
  showProgress: boolean;
  onViewAll: () => void;
  onManualAdd: () => void;
  onReceipt: () => void;
  onVoice: () => void;
};

/**
 * 2-column category bento grid inside a soft pastel section box.
 * Empty state: copy + compact quick-add pills.
 */
export const HomeCategoriesBento = memo(function HomeCategoriesBento({
  items,
  showProgress,
  onViewAll,
  onManualAdd,
  onReceipt,
  onVoice,
}: HomeCategoriesBentoProps) {
  const visible = items.slice(0, HOME_MAX_CATEGORIES);

  // Memoized: only re-groups when the items list changes.
  const rows = useMemo(() => {
    const result: HomeCategoryBentoItem[][] = [];
    for (let i = 0; i < visible.length; i += 2) {
      result.push(visible.slice(i, i + 2));
    }
    return result;
  }, [visible]);

  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Top categories</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onViewAll}
          style={({ pressed }) => [
            styles.viewAll,
            pressed && styles.viewAllPressed,
          ]}
        >
          <Text style={styles.viewAllText}>View all</Text>
          <ChevronRight size={14} color={colors.primary} strokeWidth={2} />
        </Pressable>
      </View>

      <BentoSectionCard>
        {visible.length === 0 ? (
          <View style={styles.emptyInner}>
            <Text style={styles.emptyText}>No spending yet this month</Text>
            <Text style={styles.emptyHint}>
              Your categories will appear here once you add transactions.
            </Text>
            <BentoQuickAddPills
              onManualAdd={onManualAdd}
              onReceipt={onReceipt}
              onVoice={onVoice}
            />
          </View>
        ) : (
          <View style={styles.grid}>
            {rows.map((row, rowIdx) => (
              <View key={rowIdx} style={styles.row}>
                {row.map((item) => (
                  <BentoCategoryTile
                    key={item.id}
                    item={item}
                    showProgress={showProgress}
                  />
                ))}
                {row.length === 1 ? <View style={styles.tileSpacer} /> : null}
              </View>
            ))}
          </View>
        )}
      </BentoSectionCard>
    </View>
  );
});

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: HOME_SECTION_HEADER_GAP,
  },
  sectionTitle: {
    ...typography.sectionTitle,
  },
  viewAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  viewAllPressed: {
    opacity: 0.65,
  },
  viewAllText: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.primary,
  },
  emptyInner: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  emptyText: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    color: bento.onPastel.primary,
    textAlign: "center",
  },
  emptyHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17,
    color: bento.onPastel.secondary,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  grid: {
    gap: HOME_BENTO_GAP,
  },
  row: {
    flexDirection: "row",
    gap: HOME_BENTO_GAP,
  },
  tileSpacer: {
    flex: 1,
  },
});

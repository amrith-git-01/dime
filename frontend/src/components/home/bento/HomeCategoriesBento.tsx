import { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { bento, spacing, typography } from "@/constants/theme";

import { BentoCategoryTile } from "./BentoCategoryTile";
import { BentoEmptyState } from "./BentoEmptyState";
import { BentoSectionCard } from "./BentoSectionCard";
import { BentoSectionHeader } from "./BentoSectionHeader";
import { HOME_BENTO_GAP, HOME_MAX_CATEGORIES } from "./homeBentoTokens";
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
      <BentoSectionHeader title="Top categories" onViewAll={onViewAll} />

      <BentoSectionCard>
        {visible.length === 0 ? (
          <BentoEmptyState
            title="No spending yet this month"
            hint="Your categories will appear here once you add transactions."
            onManualAdd={onManualAdd}
            onReceipt={onReceipt}
            onVoice={onVoice}
          />
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

import { LayoutGrid } from "lucide-react-native";
import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { BENTO_GAP } from "@/components/bento/bentoLayoutTokens";
import {
  BentoQuickAddPills,
  BentoSectionCard,
  TwoToneEmptyState,
} from "@/components/shared";

import { BentoCategoryTile } from "./BentoCategoryTile";
import { BentoSectionHeader } from "./BentoSectionHeader";

import { HOME_MAX_CATEGORIES } from "./homeBentoTokens";
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
  const rows: HomeCategoryBentoItem[][] = [];
  for (let i = 0; i < visible.length; i += 2) {
    rows.push(visible.slice(i, i + 2));
  }

  return (
    <View>
      <BentoSectionHeader title="Top categories" onViewAll={onViewAll} />

      <BentoSectionCard>
        {visible.length === 0 ? (
          <TwoToneEmptyState
            layout="inline"
            icon={LayoutGrid}
            title="No spending yet this month"
            message="Your categories will appear here once you add transactions."
            footer={
              <BentoQuickAddPills
                onManualAdd={onManualAdd}
                onReceipt={onReceipt}
                onVoice={onVoice}
              />
            }
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
    gap: BENTO_GAP,
  },
  row: {
    flexDirection: "row",
    gap: BENTO_GAP,
  },
  tileSpacer: {
    flex: 1,
  },
});

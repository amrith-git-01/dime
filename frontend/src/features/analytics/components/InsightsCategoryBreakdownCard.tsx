import { memo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { SkeletonBlock } from "@/components/ui";
import { EmptyState, emptyStateCopy } from "@/components/shared";
import {
  accent,
  ink,
  inkSoft,
  line,
  radius,
  spacing,
  surfaceSunken,
} from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import type { CounterpartySpendRow } from "@/features/analytics/types";

import { InsightsCard } from "./InsightsCard";

const SHOW_DEFAULT = 5;

type Props = {
  counterpartySpend: CounterpartySpendRow[];
  loading?: boolean;
};

function getInitials(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

export const InsightsCategoryBreakdownCard = memo(
  function InsightsCategoryBreakdownCard({
    counterpartySpend,
    loading = false,
  }: Props) {
    const [showAll, setShowAll] = useState(false);

    const sorted = [...counterpartySpend].sort(
      (a, b) =>
        Math.abs(Number(b.debit_total)) - Math.abs(Number(a.debit_total)),
    );
    const maxAmount =
      sorted.length > 0 ? Math.abs(Number(sorted[0]?.debit_total ?? 0)) : 1;
    const visible = showAll ? sorted : sorted.slice(0, SHOW_DEFAULT);
    const hasMore = sorted.length > SHOW_DEFAULT;

    return (
      <InsightsCard kicker="WHO YOU PAID" subtitle="Top payees this month">
        {/* Rows */}
        {loading ? (
          <View style={styles.skeletonSection}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.skeletonRow}>
                <SkeletonBlock style={styles.skeletonAvatar} />
                <View style={styles.skeletonContent}>
                  <SkeletonBlock style={styles.skeletonName} />
                  <SkeletonBlock style={styles.skeletonBar} />
                </View>
                <SkeletonBlock style={styles.skeletonAmount} />
              </View>
            ))}
          </View>
        ) : sorted.length === 0 ? (
          <EmptyState
            layout="inset"
            headline={emptyStateCopy.analyticsCategoryBreakdown.headline}
            subtext={emptyStateCopy.analyticsCategoryBreakdown.subtext}
          />
        ) : (
          <View>
            {visible.map((row, idx) => {
              const amount = Math.abs(Number(row.debit_total));
              const barPct = maxAmount > 0 ? amount / maxAmount : 0;
              const isLast = idx === visible.length - 1 && !hasMore;
              return (
                <View key={row.payee_key}>
                  <View style={styles.payeeRow}>
                    <View style={styles.avatarWell}>
                      <Text style={styles.avatarLetter}>
                        {getInitials(row.display_name)}
                      </Text>
                    </View>
                    <View style={styles.payeeContent}>
                      <View style={styles.payeeNameRow}>
                        <Text style={styles.payeeName} numberOfLines={1}>
                          {row.display_name}
                        </Text>
                        <View style={styles.payeeRight}>
                          <Text style={styles.payeeAmount}>
                            {formatAmount(row.debit_total)}
                          </Text>
                          <Text style={styles.payeeShare}>
                            {`${Math.round(row.share * 100)}%`}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.payeeBarTrack}>
                        <View
                          style={[
                            styles.payeeBarFill,
                            { width: `${Math.round(barPct * 100)}%` },
                          ]}
                        />
                      </View>
                    </View>
                  </View>
                  {!isLast ? <View style={styles.rowDivider} /> : null}
                </View>
              );
            })}
            {hasMore && !showAll ? (
              <Pressable
                onPress={() => setShowAll(true)}
                style={styles.showMoreBtn}
                accessibilityRole="button"
              >
                <Text style={styles.showMoreLabel}>
                  {`Show all ${sorted.length} payees`}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </InsightsCard>
    );
  },
);

function formatAmount(rawDebit: string): string {
  const n = Math.abs(Number.parseFloat(rawDebit));
  if (!Number.isFinite(n)) return "\u2014";
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

const styles = StyleSheet.create({
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: line,
    marginLeft: spacing.lg + 32 + spacing.md,
  },
  payeeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  avatarWell: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: surfaceSunken,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarLetter: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    lineHeight: 18,
    color: inkSoft,
  },
  payeeContent: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  payeeNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  payeeName: {
    flex: 1,
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: ink,
  },
  payeeRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 0,
  },
  payeeAmount: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: ink,
    fontVariant: ["tabular-nums"],
  },
  payeeShare: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 15,
    color: inkSoft,
    fontVariant: ["tabular-nums"],
  },
  payeeBarTrack: {
    height: 3,
    backgroundColor: surfaceSunken,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  payeeBarFill: {
    height: 3,
    backgroundColor: accent,
    borderRadius: radius.full,
  },
  showMoreBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: line,
  },
  showMoreLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: accent,
  },
  skeletonSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  skeletonAvatar: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
  },
  skeletonContent: {
    flex: 1,
    gap: spacing.xs,
  },
  skeletonName: {
    height: 14,
    width: "55%",
    borderRadius: radius.sm,
  },
  skeletonBar: {
    height: 3,
    width: "70%",
    borderRadius: radius.full,
  },
  skeletonAmount: {
    width: 44,
    height: 14,
    borderRadius: radius.sm,
  },
});

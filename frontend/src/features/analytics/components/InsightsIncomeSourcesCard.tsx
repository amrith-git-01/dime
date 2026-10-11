import { memo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { SkeletonBlock } from "@/components/ui";
import { EmptyState, emptyStateCopy } from "@/components/shared";
import {
  ink,
  inkSoft,
  line,
  radius,
  spacing,
  success,
  successTint,
  surfaceSunken,
} from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import type { CounterpartyIncomeRow } from "@/features/analytics/types";

import { InsightsCard } from "./InsightsCard";

const SHOW_DEFAULT = 5;

type Props = {
  counterpartyIncome: CounterpartyIncomeRow[];
  loading?: boolean;
};

function getInitials(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

export const InsightsIncomeSourcesCard = memo(
  function InsightsIncomeSourcesCard({
    counterpartyIncome,
    loading = false,
  }: Props) {
    const [showAll, setShowAll] = useState(false);

    const sorted = [...counterpartyIncome].sort(
      (a, b) =>
        Math.abs(Number(b.credit_total)) - Math.abs(Number(a.credit_total)),
    );
    const maxAmount =
      sorted.length > 0 ? Math.abs(Number(sorted[0]?.credit_total ?? 0)) : 1;
    const visible = showAll ? sorted : sorted.slice(0, SHOW_DEFAULT);
    const hasMore = sorted.length > SHOW_DEFAULT;

    return (
      <InsightsCard
        kicker="WHO PAID YOU"
        subtitle="Top income sources this month"
      >
        {loading ? (
          <View>
            {[0, 1, 2, 3, 4].map((i) => (
              <View key={i}>
                {i > 0 && <View style={styles.rowDivider} />}
                <View style={styles.skeletonRow}>
                  <SkeletonBlock style={styles.skeletonAvatar} />
                  <View style={styles.skeletonContent}>
                    <View style={styles.skeletonNameRow}>
                      <SkeletonBlock style={styles.skeletonName} />
                      <SkeletonBlock style={styles.skeletonAmount} />
                    </View>
                    <SkeletonBlock style={styles.skeletonBar} />
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : sorted.length === 0 ? (
          <EmptyState
            layout="inset"
            headline={emptyStateCopy.analyticsIncomeSources.headline}
            subtext={emptyStateCopy.analyticsIncomeSources.subtext}
          />
        ) : (
          <View>
            {visible.map((row, idx) => {
              const amount = Math.abs(Number(row.credit_total));
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
                            {formatAmount(row.credit_total)}
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
                  {`Show all ${sorted.length} sources`}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </InsightsCard>
    );
  },
);

function formatAmount(rawCredit: string): string {
  const n = Math.abs(Number.parseFloat(rawCredit));
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
    backgroundColor: successTint,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarLetter: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    lineHeight: 18,
    color: success,
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
    color: success,
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
    backgroundColor: success,
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
    color: success,
  },
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  skeletonAvatar: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    flexShrink: 0,
  },
  skeletonContent: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  skeletonNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  skeletonName: {
    height: 13,
    width: "52%",
    borderRadius: radius.sm,
  },
  skeletonAmount: {
    width: 40,
    height: 13,
    borderRadius: radius.sm,
    flexShrink: 0,
  },
  skeletonBar: {
    height: 4,
    width: "70%",
    borderRadius: radius.full,
  },
});

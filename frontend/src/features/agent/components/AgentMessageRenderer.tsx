import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { BENTO_GAP } from "@/components/bento";
import { BentoStatCell } from "@/components/shared";
import { TwoToneCard } from "@/components/shared/TwoToneCard";
import { colors, radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import type { AgentBlock, AgentDeepLink } from "../types";

type AgentMessageRendererProps = {
  role: "user" | "assistant";
  content: string;
  blocks: AgentBlock[];
  deepLink: AgentDeepLink | null;
  isStreaming?: boolean;
  onDeepLinkPress?: (link: AgentDeepLink) => void;
};

function MetricBlock({
  block,
}: {
  block: Extract<AgentBlock, { type: "metric" }>;
}) {
  return (
    <TwoToneCard
      header={
        <View style={styles.metricHeader}>
          <BentoStatCell label={block.label} value={block.value} />
          {block.delta ? (
            <Text style={styles.metricDelta}>{block.delta}</Text>
          ) : null}
        </View>
      }
      body={<View />}
    />
  );
}

function CategoryRowBlock({
  block,
}: {
  block: Extract<AgentBlock, { type: "category_row" }>;
}) {
  return (
    <View style={styles.categoryRow}>
      <Text style={styles.categoryName} numberOfLines={1}>
        {block.name}
      </Text>
      <View style={styles.categoryMeta}>
        <Text style={styles.categoryAmount}>{block.amount}</Text>
        <Text style={styles.categoryPct}>{block.pct.toFixed(0)}%</Text>
      </View>
    </View>
  );
}

function TxPreviewBlock({
  block,
}: {
  block: Extract<AgentBlock, { type: "tx_preview" }>;
}) {
  return (
    <View style={styles.txPreview}>
      {block.rows.slice(0, 5).map((row, index) => {
        const name = String(row.counterparty_name ?? row.merchant ?? "Unknown");
        const amount = String(row.amount ?? "");
        const type = String(row.type ?? "debit");
        return (
          <View key={`${name}-${index}`} style={styles.txRow}>
            <Text style={styles.txName} numberOfLines={1}>
              {name}
            </Text>
            <Text
              style={[
                styles.txAmount,
                type === "credit" && styles.txAmountCredit,
              ]}
            >
              {amount}
            </Text>
          </View>
        );
      })}
      {block.total_count > block.rows.length ? (
        <Text style={styles.txMore}>
          +{block.total_count - block.rows.length} more
        </Text>
      ) : null}
    </View>
  );
}

function MiniChartBlock({
  block,
}: {
  block: Extract<AgentBlock, { type: "mini_chart" }>;
}) {
  const label =
    block.chart_kind === "donut" ? "Spending breakdown" : "Daily cashflow";
  const pointCount = Array.isArray(block.payload?.points)
    ? block.payload.points.length
    : Array.isArray(block.payload?.series)
      ? block.payload.series.length
      : 0;

  return (
    <View style={styles.chartPlaceholder}>
      <Text style={styles.chartTitle}>{label}</Text>
      <Text style={styles.chartMeta}>
        {pointCount > 0 ? `${pointCount} data points` : "Chart data"}
      </Text>
    </View>
  );
}

function BlockView({ block }: { block: AgentBlock }) {
  switch (block.type) {
    case "metric":
      return <MetricBlock block={block} />;
    case "category_row":
      return <CategoryRowBlock block={block} />;
    case "tx_preview":
      return <TxPreviewBlock block={block} />;
    case "mini_chart":
      return <MiniChartBlock block={block} />;
    default:
      return null;
  }
}

export const AgentMessageRenderer = memo(function AgentMessageRenderer({
  role,
  content,
  blocks,
  deepLink,
  isStreaming,
  onDeepLinkPress,
}: AgentMessageRendererProps) {
  const isUser = role === "user";

  return (
    <View
      style={[
        styles.bubbleWrap,
        isUser ? styles.bubbleWrapUser : styles.bubbleWrapAssistant,
      ]}
    >
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
        ]}
      >
        {content.length > 0 ? (
          <Text style={[styles.prose, isUser && styles.proseUser]}>
            {content}
            {isStreaming ? "▍" : ""}
          </Text>
        ) : null}

        {blocks.length > 0 ? (
          <View style={styles.blocks}>
            {blocks.map((block, index) => (
              <BlockView key={`${block.type}-${index}`} block={block} />
            ))}
          </View>
        ) : null}

        {deepLink?.screen ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onDeepLinkPress?.(deepLink)}
            style={styles.deepLink}
          >
            <Text style={styles.deepLinkText}>View details →</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  bubbleWrap: {
    marginBottom: spacing.md,
    maxWidth: "92%",
  },
  bubbleWrapUser: {
    alignSelf: "flex-end",
  },
  bubbleWrapAssistant: {
    alignSelf: "flex-start",
  },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  bubbleUser: {
    backgroundColor: colors.headerGradientStart,
  },
  bubbleAssistant: {
    backgroundColor: colors.barBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  prose: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  proseUser: {
    color: colors.barBackground,
  },
  blocks: {
    gap: BENTO_GAP,
  },
  metricHeader: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  metricDelta: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  categoryName: {
    flex: 1,
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    color: colors.textPrimary,
  },
  categoryMeta: {
    alignItems: "flex-end",
    gap: 2,
  },
  categoryAmount: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  categoryPct: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  txPreview: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  txRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  txName: {
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    color: colors.textPrimary,
  },
  txAmount: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 14,
    color: colors.danger,
  },
  txAmountCredit: {
    color: colors.success,
  },
  txMore: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  chartPlaceholder: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.pageBackground,
    gap: spacing.xs,
  },
  chartTitle: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    color: colors.textPrimary,
  },
  chartMeta: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  deepLink: {
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
  },
  deepLinkText: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    color: colors.headerGradientStart,
  },
});

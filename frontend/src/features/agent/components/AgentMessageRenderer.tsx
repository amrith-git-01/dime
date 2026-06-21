import { memo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { BENTO_GAP } from "@/components/bento";
import { BentoStatCell } from "@/components/shared";
import { accent, colors, ink, inkSoft, radius, shadow, spacing, surface } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import type { AgentBlock, AgentDeepLink } from "../types";

import { AgentCompareMonthsBlock } from "./AgentCompareMonthsBlock";
import { AgentMessageProse } from "./AgentMessageProse";
import { AgentMiniChartBlock } from "./AgentMiniChartBlock";
import { AgentThinkingBubble } from "./AgentThinkingBubble";

type AgentMessageRendererProps = {
  role: "user" | "assistant";
  content: string;
  blocks: AgentBlock[];
  deepLink: AgentDeepLink | null;
  isPending?: boolean;
  onDeepLinkPress?: (link: AgentDeepLink) => void;
};

function MetricBlock({
  block,
}: {
  block: Extract<AgentBlock, { type: "metric" }>;
}) {
  return (
    <View style={styles.metricCard}>
      <BentoStatCell label={block.label} value={block.value} />
      {block.delta ? (
        <Text style={styles.metricDelta}>{block.delta}</Text>
      ) : null}
    </View>
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

function BlockView({ block }: { block: AgentBlock }) {
  switch (block.type) {
    case "metric":
      return <MetricBlock block={block} />;
    case "category_row":
      return <CategoryRowBlock block={block} />;
    case "tx_preview":
      return <TxPreviewBlock block={block} />;
    case "mini_chart":
      return <AgentMiniChartBlock block={block} />;
    case "compare_months": {
      const revealKey = `compare_months|${block.period_a_label}|${block.period_b_label}`;
      return <AgentCompareMonthsBlock {...block} revealKey={revealKey} />;
    }
    default:
      return null;
  }
}

export const AgentMessageRenderer = memo(function AgentMessageRenderer({
  role,
  content,
  blocks,
  deepLink,
  isPending,
  onDeepLinkPress,
}: AgentMessageRendererProps) {
  const isUser = role === "user";
  const hasContent =
    content.length > 0 || blocks.length > 0 || Boolean(deepLink?.screen);

  if (!isUser && isPending && !hasContent) {
    return <AgentThinkingBubble active />;
  }

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
        {blocks.length > 0 ? (
          <View style={styles.blocks}>
            {blocks.map((block, index) => (
              <BlockView key={`${block.type}-${index}`} block={block} />
            ))}
          </View>
        ) : null}
        {content.length > 0 ? (
          <AgentMessageProse
            content={content}
            variant={isUser ? "user" : "assistant"}
          />
        ) : null}

        {deepLink?.screen ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onDeepLinkPress?.(deepLink)}
            style={styles.deepLink}
          >
            <Text style={styles.deepLinkText}>
              {deepLink.label ?? "View details →"}
            </Text>
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
    backgroundColor: accent,
  },
  bubbleAssistant: {
    backgroundColor: surface,
    ...Platform.select({
      android: { elevation: 2 },
      default: {
        shadowColor: shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
    }),
  },
  blocks: {
    gap: BENTO_GAP,
  },
  metricCard: {
    backgroundColor: surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...Platform.select({
      android: { elevation: 2 },
      default: {
        shadowColor: shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
    }),
  },
  metricDelta: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    color: inkSoft,
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
    color: ink,
  },
  categoryMeta: {
    alignItems: "flex-end",
    gap: 2,
  },
  categoryAmount: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 14,
    color: ink,
  },
  categoryPct: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: inkSoft,
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
    color: ink,
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
    color: inkSoft,
    marginTop: spacing.xs,
  },
  deepLink: {
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
  },
  deepLinkText: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    color: accent,
  },
});

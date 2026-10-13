import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { BENTO_GAP } from "@/components/bento";
import { BentoStatCell } from "@/components/shared";
import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import type {
  AgentBlock,
  AgentDeepLink,
  AgentFeedbackRating,
} from "../types";

import { AgentCompareMonthsBlock } from "./AgentCompareMonthsBlock";
import { AgentFeedbackButtons } from "./AgentFeedbackButtons";
import { AgentMessageProse } from "./AgentMessageProse";
import { AgentMiniChartBlock } from "./AgentMiniChartBlock";
import { AgentThinkingBubble } from "./AgentThinkingBubble";
import { createThemedStyles } from "@/theme";

type AgentMessageRendererProps = {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks: AgentBlock[];
  deepLink: AgentDeepLink | null;
  isPending?: boolean;
  isError?: boolean;
  stepLabel?: string | null;
  /** Present on completed assistant answers; enables the feedback row. */
  turnId?: string | null;
  feedback?: AgentFeedbackRating | null;
  onDeepLinkPress?: (link: AgentDeepLink) => void;
  onFeedback?: (messageId: string, rating: AgentFeedbackRating) => void;
};

function MetricBlock({
  block,
}: {
  block: Extract<AgentBlock, { type: "metric" }>;
}) {
  const styles = useStyles();
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
  const styles = useStyles();
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
  const styles = useStyles();
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
  id,
  role,
  content,
  blocks,
  deepLink,
  isPending,
  isError,
  stepLabel,
  turnId,
  feedback,
  onDeepLinkPress,
  onFeedback,
}: AgentMessageRendererProps) {
  const styles = useStyles();
  const isUser = role === "user";
  const hasContent =
    content.length > 0 || blocks.length > 0 || Boolean(deepLink?.screen);

  if (!isUser && isPending && !hasContent) {
    return <AgentThinkingBubble label={stepLabel} />;
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

        {!isUser && !isPending && !isError && turnId && onFeedback ? (
          <AgentFeedbackButtons
            messageId={id}
            feedback={feedback ?? null}
            onFeedback={onFeedback}
          />
        ) : null}
      </View>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors, shadows }) => ({
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
    backgroundColor: colors.accent,
  },
  bubbleAssistant: {
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  blocks: {
    gap: BENTO_GAP,
  },
  metricCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadows.card,
  },
  metricDelta: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    color: colors.inkSoft,
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
    color: colors.ink,
  },
  categoryMeta: {
    alignItems: "flex-end",
    gap: 2,
  },
  categoryAmount: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 14,
    color: colors.ink,
  },
  categoryPct: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.inkSoft,
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
    color: colors.ink,
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
    color: colors.inkSoft,
    marginTop: spacing.xs,
  },
  deepLink: {
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
  },
  deepLinkText: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    color: colors.accentText,
  },
}));

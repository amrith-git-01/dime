import { memo, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { ClockwiseAnimatedPie } from "@/features/analytics/components/ClockwiseAnimatedPie";
import { PayeeDonutEmptyChart } from "@/features/analytics/components/PayeeDonutChart";
import { CompareCashflowColumn } from "@/features/analytics/components/compare/CompareCashflowColumn";
import { COUNTERPARTY_DONUT_INNER_RADIUS_RATIO } from "@/features/analytics/constants/counterpartyDonut";
import type { DailyCashflowRow } from "@/features/analytics/types";
import { formatInrCompact } from "@/utils/currency";

import { useAgentDonutReveal } from "../hooks/useAgentChartReveal";
import type {
  AgentBlockCompareMonths,
  CompareMonthCashflowDay,
  CompareMonthPayee,
} from "../types";
import { buildAgentDonutData } from "../utils/buildAgentDonutData";
import { createThemedStyles, useTheme } from "@/theme";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Fixed card width — wide enough for the chart, narrow enough to peek at next. */
const CASHFLOW_CARD_WIDTH = 228;
const DONUT_CARD_WIDTH = CASHFLOW_CARD_WIDTH;
const DONUT_SIZE = 96;
const TOP_PAYEE_COUNT = 4;

// ─── Data adapters ────────────────────────────────────────────────────────────

function toDailyCashflowRows(
  cashflow: CompareMonthCashflowDay[],
): DailyCashflowRow[] {
  return cashflow.map((d) => ({
    date: d.date,
    debit_total: String(d.expense),
    credit_total: String(d.income),
  }));
}

function yearMonthFromCashflow(
  cashflow: CompareMonthCashflowDay[],
): { year: number; monthIndex0: number } | null {
  const firstDate = cashflow[0]?.date;
  if (!firstDate || firstDate.length < 7) return null;
  const y = parseInt(firstDate.slice(0, 4), 10);
  const m = parseInt(firstDate.slice(5, 7), 10) - 1;
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return { year: y, monthIndex0: m };
}

// ─── Summary ──────────────────────────────────────────────────────────────────

function SummaryRow({
  label,
  aVal,
  bVal,
  isNet,
}: {
  label: string;
  aVal: number;
  bVal: number;
  isNet?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const fmt = (n: number, net?: boolean) => {
    if (!Number.isFinite(n)) return "—";
    const abs = formatInrCompact(Math.abs(n));
    if (!net) return abs;
    return n >= 0 ? `+${abs}` : `-${abs}`;
  };
  const colorA = isNet
    ? aVal >= 0
      ? colors.success
      : colors.danger
    : colors.ink;
  const colorB = isNet
    ? bVal >= 0
      ? colors.success
      : colors.danger
    : colors.inkSoft;

  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryVal, { color: colorA }]}>
        {fmt(aVal, isNet)}
      </Text>
      <Text style={[styles.summaryVal, styles.summaryValB, { color: colorB }]}>
        {fmt(bVal, isNet)}
      </Text>
    </View>
  );
}

// ─── Section divider ──────────────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerLabel}>{label}</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

// ─── Card shell ───────────────────────────────────────────────────────────────

function CardShell({
  width,
  label,
  color,
  children,
}: {
  width: number;
  label: string;
  color: string;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.card, { width }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardDot, { backgroundColor: color }]} />
        <Text style={[styles.cardLabel, { color }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      {children}
    </View>
  );
}

// ─── Cashflow card ────────────────────────────────────────────────────────────

const CashflowCard = memo(function CashflowCard({
  cashflow,
  periodLabel,
  color,
}: {
  cashflow: CompareMonthCashflowDay[];
  periodLabel: string;
  color: string;
}) {
  const rows = useMemo(() => toDailyCashflowRows(cashflow), [cashflow]);
  const yearMonth = useMemo(() => yearMonthFromCashflow(cashflow), [cashflow]);

  if (!yearMonth) return null;

  return (
    <CardShell width={CASHFLOW_CARD_WIDTH} label={periodLabel} color={color}>
      <CompareCashflowColumn
        dailyCashflow={rows}
        year={yearMonth.year}
        monthIndex0={yearMonth.monthIndex0}
      />
    </CardShell>
  );
});

// ─── Donut card ───────────────────────────────────────────────────────────────

const DonutCard = memo(function DonutCard({
  payees,
  periodLabel,
  color,
  revealKey,
}: {
  payees: CompareMonthPayee[];
  periodLabel: string;
  color: string;
  revealKey: string;
}) {
  const styles = useStyles();
  const { colors: themeColors } = useTheme();
  const donutData = useMemo(
    () =>
      buildAgentDonutData(
        payees.map((p) => ({ name: p.name, value: p.amount })),
        themeColors.donut,
      ),
    [payees, themeColors.donut],
  );
  const hasData = donutData.length > 0;
  const pieProgress = useAgentDonutReveal(`${revealKey}-donut-${periodLabel}`);

  return (
    <CardShell width={DONUT_CARD_WIDTH} label={periodLabel} color={color}>
      <View style={styles.donutWrap}>
        {hasData ? (
          <ClockwiseAnimatedPie
            data={donutData}
            size={DONUT_SIZE}
            innerRadiusRatio={COUNTERPARTY_DONUT_INNER_RADIUS_RATIO}
            progress={pieProgress}
          />
        ) : (
          <PayeeDonutEmptyChart size={DONUT_SIZE} />
        )}
      </View>
      <View style={styles.payeeLegend}>
        {donutData.slice(0, TOP_PAYEE_COUNT).map((slice) => (
          <View key={slice.payee_key} style={styles.payeeRow}>
            <View
              style={[styles.payeeSwatch, { backgroundColor: slice.color }]}
            />
            <Text style={styles.payeeName} numberOfLines={1}>
              {slice.display_name}
            </Text>
            <Text style={styles.payeeAmt}>{formatInrCompact(slice.value)}</Text>
          </View>
        ))}
        {!hasData && <Text style={styles.emptyHint}>No data</Text>}
      </View>
    </CardShell>
  );
});

// ─── Horizontal chart row ─────────────────────────────────────────────────────

function ChartScrollRow({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      {children}
    </ScrollView>
  );
}

// ─── Main block ───────────────────────────────────────────────────────────────

type Props = AgentBlockCompareMonths & { revealKey: string };

export const AgentCompareMonthsBlock = memo(function AgentCompareMonthsBlock({
  period_a_label,
  period_b_label,
  period_a,
  period_b,
  revealKey,
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const COLOR_A = colors.accentText;
  const COLOR_B = colors.inkSoft;
  const hasPayees = period_a.payees.length > 0 || period_b.payees.length > 0;

  return (
    <View style={styles.root}>
      {/* Period header */}
      <View style={styles.headerRow}>
        <View style={[styles.periodDot, { backgroundColor: COLOR_A }]} />
        <Text
          style={[styles.periodLabel, { color: COLOR_A }]}
          numberOfLines={1}
        >
          {period_a_label}
        </Text>
        <Text style={styles.vsText}>vs</Text>
        <Text
          style={[styles.periodLabel, { color: COLOR_B }]}
          numberOfLines={1}
        >
          {period_b_label}
        </Text>
        <View style={[styles.periodDot, { backgroundColor: COLOR_B }]} />
      </View>

      {/* Summary stats */}
      <View style={styles.summarySection}>
        <View style={styles.summaryColHeaders}>
          <Text style={styles.summaryLabelSpacer} />
          <Text style={[styles.summaryColHead, { color: COLOR_A }]}>
            {period_a_label}
          </Text>
          <Text
            style={[
              styles.summaryColHead,
              styles.summaryColHeadB,
              { color: COLOR_B },
            ]}
          >
            {period_b_label}
          </Text>
        </View>
        <SummaryRow label="Spent" aVal={period_a.spent} bVal={period_b.spent} />
        <SummaryRow
          label="Income"
          aVal={period_a.income}
          bVal={period_b.income}
        />
        <SummaryRow label="Net" aVal={period_a.net} bVal={period_b.net} isNet />
      </View>

      {/* ── Daily Spend ── */}
      <SectionDivider label="Daily Spend" />
      <ChartScrollRow>
        <CashflowCard
          cashflow={period_a.cashflow}
          periodLabel={period_a_label}
          color={COLOR_A}
        />
        <CashflowCard
          cashflow={period_b.cashflow}
          periodLabel={period_b_label}
          color={COLOR_B}
        />
      </ChartScrollRow>

      {/* ── Top Payees ── */}
      {hasPayees ? (
        <>
          <SectionDivider label="Top Payees" />
          <ChartScrollRow>
            <DonutCard
              payees={period_a.payees}
              periodLabel={period_a_label}
              color={COLOR_A}
              revealKey={revealKey}
            />
            <DonutCard
              payees={period_b.payees}
              periodLabel={period_b_label}
              color={COLOR_B}
              revealKey={revealKey}
            />
          </ChartScrollRow>
        </>
      ) : null}
    </View>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const useStyles = createThemedStyles(({ colors }) => ({
  root: {
    gap: spacing.sm,
  },

  // Period header
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  periodDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  periodLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    flexShrink: 1,
  },
  vsText: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    color: colors.inkSoft,
    marginHorizontal: spacing.xs,
  },

  // Summary
  summarySection: {
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  summaryColHeaders: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  summaryLabelSpacer: {
    width: 56,
  },
  summaryColHead: {
    flex: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 10,
    textAlign: "right",
  },
  summaryColHeadB: {
    paddingRight: 0,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  summaryLabel: {
    width: 56,
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    color: colors.inkSoft,
  },
  summaryVal: {
    flex: 1,
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 12,
    color: colors.ink,
    textAlign: "right",
  },
  summaryValB: {
    color: colors.inkSoft,
  },

  // Section divider
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: 2,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
  },
  dividerLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    color: colors.inkSoft,
    letterSpacing: 0.3,
  },

  // Horizontal scroll row
  scrollContent: {
    gap: spacing.sm,
  },

  // Card shell
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: spacing.sm,
    gap: spacing.xs,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 2,
  },
  cardDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  cardLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 11,
    flexShrink: 1,
  },

  // Donut card
  donutWrap: {
    alignSelf: "center",
    marginVertical: spacing.xs,
  },
  payeeLegend: {
    gap: 4,
  },
  payeeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  payeeSwatch: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  payeeName: {
    flex: 1,
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    color: colors.ink,
  },
  payeeAmt: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 10,
    color: colors.inkSoft,
  },
  emptyHint: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    color: colors.inkSoft,
  },
}));

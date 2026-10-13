import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { spacing } from "@/constants/spacing";
import { createThemedStyles, useTheme } from "@/theme";

type MonthStatRowProps = {
  incomeDisplay: string;
  incomeValue: number;
  spentDisplay: string;
  spentValue: number;
  netDisplay: string;
  netValue: number;
};

function isZero(value: number): boolean {
  return !Number.isFinite(value) || value === 0;
}

export const MonthStatRow = memo(function MonthStatRow({
  incomeDisplay,
  incomeValue,
  spentDisplay,
  spentValue,
  netDisplay,
  netValue,
}: MonthStatRowProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const incomeColor = isZero(incomeValue) ? colors.ink : colors.success;
  const spentColor = isZero(spentValue) ? colors.ink : colors.danger;
  const netColor = isZero(netValue) ? colors.ink : netValue > 0 ? colors.success : colors.danger;

  return (
    <View style={styles.row}>
      <View style={styles.cell}>
        <Text style={styles.label}>Income</Text>
        <Text style={[styles.amount, { color: incomeColor }]}>
          {incomeDisplay}
        </Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.cell}>
        <Text style={styles.label}>Spent</Text>
        <Text style={[styles.amount, { color: spentColor }]}>
          {spentDisplay}
        </Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.cell}>
        <Text style={styles.label}>Net</Text>
        <Text style={[styles.amount, { color: netColor }]}>{netDisplay}</Text>
      </View>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  cell: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 32,
    backgroundColor: colors.line,
    marginHorizontal: spacing.sm,
  },
  label: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.inkFaint,
  },
  amount: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    lineHeight: 20,
    fontVariant: ["tabular-nums"],
  },
}));

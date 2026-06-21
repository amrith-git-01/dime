import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { danger, ink, inkFaint, line, success } from "@/constants/colors";
import { fontFamilies } from "@/constants/fonts";
import { spacing } from "@/constants/spacing";

type MonthStatRowProps = {
  spentDisplay: string;
  netDisplay: string;
  netValue: number;
};

export const MonthStatRow = memo(function MonthStatRow({
  spentDisplay,
  netDisplay,
  netValue,
}: MonthStatRowProps) {
  const netColor = netValue >= 0 ? success : danger;

  return (
    <View style={styles.row}>
      <View style={styles.cell}>
        <Text style={styles.label}>SPENT</Text>
        <Text style={[styles.amount, { color: ink }]}>{spentDisplay}</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.cell}>
        <Text style={styles.label}>NET</Text>
        <Text style={[styles.amount, { color: netColor }]}>{netDisplay}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
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
    backgroundColor: line,
    marginHorizontal: spacing.md,
  },
  label: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: inkFaint,
  },
  amount: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    fontVariant: ["tabular-nums"],
  },
});

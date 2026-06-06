import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { BentoStatCellTone } from "@/components/shared";
import { SkeletonStrip } from "@/components/ui";
import { bento, colors } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

type CompareMiniStatProps = {
  label: string;
  value: string;
  tone?: BentoStatCellTone;
  loading?: boolean;
};

export const CompareMiniStat = memo(function CompareMiniStat({
  label,
  value,
  tone = "neutral",
  loading = false,
}: CompareMiniStatProps) {
  const valueColor =
    tone === "debit"
      ? colors.danger
      : tone === "credit"
        ? colors.success
        : colors.textPrimary;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {loading ? (
        <SkeletonStrip variant="statValue" style={styles.valueSkeleton} />
      ) : (
        <Text style={[styles.value, { color: valueColor }]} numberOfLines={1}>
          {value}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    gap: 2,
  },
  label: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 13,
    color: bento.onPastel.muted,
  },
  value: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 13,
    lineHeight: 17,
  },
  valueSkeleton: {
    width: "70%",
    marginTop: 2,
  },
});

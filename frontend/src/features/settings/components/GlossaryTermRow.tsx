import { ChevronDown } from "lucide-react-native";
import { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  ink,
  inkFaint,
  inkSoft,
  line,
  radius,
  spacing,
  surfaceSunken,
} from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";

export type GlossaryTermRowProps = {
  id: string;
  term: string;
  description: string;
  expanded: boolean;
  onToggle: (id: string) => void;
  showSeparator?: boolean;
};

export const GlossaryTermRow = memo(function GlossaryTermRow({
  id,
  term,
  description,
  expanded,
  onToggle,
  showSeparator = false,
}: GlossaryTermRowProps) {
  const handlePress = useCallback(() => {
    void triggerHaptic();
    onToggle(id);
  }, [id, onToggle]);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={term}
        onPress={handlePress}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        <View style={styles.titleRow}>
          <Text style={styles.term}>{term}</Text>
          <ChevronDown
            size={20}
            color={inkFaint}
            strokeWidth={2}
            style={expanded ? styles.chevronExpanded : undefined}
          />
        </View>
        {expanded ? (
          <Text style={styles.description}>{description}</Text>
        ) : null}
      </Pressable>
      {showSeparator ? <View style={styles.separator} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    minHeight: 52,
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radius.sm,
  },
  rowPressed: {
    backgroundColor: surfaceSunken,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  term: {
    flex: 1,
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 22,
    color: ink,
  },
  description: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: inkSoft,
    paddingRight: 28,
  },
  chevronExpanded: {
    transform: [{ rotate: "180deg" }],
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: line,
    marginHorizontal: spacing.sm,
  },
});

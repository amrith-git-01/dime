import { ArrowUpRight } from "lucide-react-native";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { tourTargetIds } from "@/constants/tourTargetIds";
import { useTourTarget } from "@/hooks/useTourTarget";
import { AGENT_SUGGESTED_PROMPT_META } from "@/features/agent/constants/suggestedPrompts";
import { createThemedStyles, useTheme } from "@/theme";

type AgentSuggestionsHeaderProps = { onSelectPrompt: (p: string) => void };

/** "Try asking" prompt list shown above an empty conversation. */
export const AgentSuggestionsHeader = memo(function AgentSuggestionsHeader({
  onSelectPrompt,
}: AgentSuggestionsHeaderProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const tourTarget = useTourTarget(tourTargetIds.agentSuggestions);
  return (
    <View {...tourTarget} style={styles.container}>
      <Text style={styles.title}>TRY ASKING</Text>
      <View style={styles.list}>
        {AGENT_SUGGESTED_PROMPT_META.map(({ prompt, icon: Icon }) => (
          <Pressable
            key={prompt}
            accessibilityRole="button"
            accessibilityLabel={prompt}
            onPress={() => onSelectPrompt(prompt)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <View style={styles.iconWell}>
              <Icon size={16} color={colors.accentText} strokeWidth={1.5} />
            </View>
            <Text style={styles.rowText}>{prompt}</Text>
            <ArrowUpRight size={14} color={colors.inkFaint} strokeWidth={2} />
          </Pressable>
        ))}
      </View>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  container: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  title: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.inkSoft,
  },
  list: {
    gap: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 44,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: radius.sm,
  },
  rowPressed: {
    backgroundColor: colors.surfaceSunken,
  },
  iconWell: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.accentTint,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    color: colors.ink,
    lineHeight: 22,
  },
}));

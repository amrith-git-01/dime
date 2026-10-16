import { CheckCircle2 } from "lucide-react-native";
import { ActivityIndicator, Text, View } from "react-native";

import { Button } from "@/components/ui";
import { fontFamilies, spacing } from "@/constants";
import { createThemedStyles, useTheme } from "@/theme";

import type { CapturePhase } from "../utils/runCapture";

type CapturePillProps = {
  phase: CapturePhase;
  text: string;
  onRetry: () => void;
  onClose: () => void;
};

/** The floating pill of Scan, Gallery and Voice after the file is picked: sending, reading, then the result. */
export function CapturePill({ phase, text, onRetry, onClose }: CapturePillProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const busy = phase === "uploading" || phase === "reading";

  return (
    <>
      {busy ? <ActivityIndicator color={colors.accentText} /> : null}
      {phase === "added" ? <CheckCircle2 size={20} color={colors.success} /> : null}
      <Text
        style={[
          styles.text,
          phase === "failed" && styles.textFailed,
          phase === "added" && styles.textAdded,
        ]}
        numberOfLines={2}
        accessibilityRole={phase === "failed" ? "alert" : undefined}
        accessibilityLiveRegion="polite"
      >
        {text}
      </Text>
      {phase === "failed" ? (
        <View style={styles.actions}>
          <Button title="Try again" size="compact" onPress={onRetry} />
          <Button title="Close" variant="ghost" size="compact" onPress={onClose} />
        </View>
      ) : null}
    </>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  text: {
    flexShrink: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
  textFailed: {
    color: colors.danger,
  },
  textAdded: {
    color: colors.success,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
}));

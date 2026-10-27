import { Eye, EyeOff, Share2 } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import type { ReportTone } from "@/constants/reportPalette";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { createThemedStyles } from "@/theme";

const BUTTON_HEIGHT = 52;

type ClosingControlsProps = {
  tone: ReportTone;
  showAmounts: boolean;
  sharing: boolean;
  onToggleAmounts: () => void;
  onShare: () => void;
  onDone: () => void;
};

/**
 * Share, Done and the "Show amounts" switch of the closing slide. Drawn by the player outside the
 * tap-to-turn gesture area, so pressing a button never turns the page.
 */
export function ClosingControls({
  tone,
  showAmounts,
  sharing,
  onToggleAmounts,
  onShare,
  onDone,
}: ClosingControlsProps) {
  const styles = useStyles();
  const EyeIcon = showAmounts ? Eye : EyeOff;
  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="Show amounts on the shared card"
        accessibilityState={{ checked: showAmounts }}
        onPress={() => {
          void triggerHaptic();
          onToggleAmounts();
        }}
        style={styles.toggle}
      >
        <EyeIcon size={18} color={tone.textSoft} strokeWidth={2} />
        <Text style={[styles.toggleText, { color: tone.textSoft }]}>
          {showAmounts ? "Amounts shown on the card" : "Show amounts on the card"}
        </Text>
      </Pressable>

      <View style={styles.buttons}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share your Broke Report"
          accessibilityState={{ busy: sharing, disabled: sharing }}
          disabled={sharing}
          onPress={() => {
            void triggerHaptic();
            onShare();
          }}
          style={({ pressed }) => [
            styles.button,
            styles.primary,
            { backgroundColor: tone.highlight, opacity: sharing || pressed ? 0.8 : 1 },
          ]}
        >
          <Share2 size={18} color={tone.onHighlight} strokeWidth={2.25} />
          <Text style={[styles.buttonText, { color: tone.onHighlight }]}>
            Share
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Done, close the report"
          onPress={() => {
            void triggerHaptic();
            onDone();
          }}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: tone.panel, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={[styles.buttonText, { color: tone.text }]}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(() => ({
  root: {
    gap: spacing.md,
  },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 44,
  },
  toggleText: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  buttons: {
    flexDirection: "row",
    gap: spacing.md,
  },
  button: {
    flex: 1,
    height: BUTTON_HEIGHT,
    borderRadius: radius.full,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  primary: {
    flex: 1.4,
  },
  buttonText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 22,
  },
}));

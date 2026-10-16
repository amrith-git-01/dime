import { Mic } from "lucide-react-native";
import { ActivityIndicator, Text, View } from "react-native";

import { Button } from "@/components/ui";
import { fontFamilies, spacing } from "@/constants";
import { createThemedStyles, useTheme } from "@/theme";

import { closeCard } from "../hooks/useCardClose";
import { useVoiceCardCapture } from "../hooks/useVoiceCardCapture";
import { formatElapsed } from "../utils/captureText";
import { CapturePill } from "./CapturePill";
import { CardFrame } from "./CardFrame";

/** Voice: "Listening… 0:04" with Stop and Cancel (after a tap on Start for an untrusted link), then the same pill as Scan and Gallery. */
export function VoiceCard({ userId, trusted }: { userId: string; trusted: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const voice = useVoiceCardCapture(userId, trusted);

  // A link that did not carry our token (another app, a web page) must not start the microphone by itself.
  if (voice.phase === "idle") {
    return (
      <CardFrame variant="pill" onBackdropPress={closeCard}>
        <Button title="Tap to start recording" size="compact" onPress={() => void voice.start()} />
        <Button title="Cancel" variant="ghost" size="compact" onPress={closeCard} />
      </CardFrame>
    );
  }

  if (voice.phase !== "preparing" && voice.phase !== "recording") {
    return (
      <CardFrame variant="pill" onBackdropPress={closeCard}>
        <CapturePill
          phase={voice.phase}
          text={voice.text}
          onRetry={voice.retry}
          onClose={closeCard}
        />
      </CardFrame>
    );
  }

  const recording = voice.phase === "recording";
  const preparing = !recording;

  // Taps outside must not end a recording by accident: only Cancel and Back do.
  return (
    <CardFrame variant="pill">
      {preparing ? <ActivityIndicator color={colors.accentText} /> : <Mic size={20} color={colors.danger} />}
      <View style={styles.textBlock}>
        <Text style={styles.title} accessibilityLiveRegion="polite">
          {preparing ? "Getting ready…" : `Listening… ${formatElapsed(voice.elapsedSeconds)}`}
        </Text>
        {voice.hint ? (
          <Text style={styles.hint} accessibilityRole="alert">
            {voice.hint}
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Button title="Stop" size="compact" disabled={!recording} onPress={() => void voice.stop()} />
        <Button title="Cancel" variant="ghost" size="compact" onPress={voice.cancel} />
      </View>
    </CardFrame>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  textBlock: {
    flexShrink: 1,
  },
  title: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
  hint: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
}));

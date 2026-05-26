import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Image } from "expo-image";
import { Pause, Play } from "lucide-react-native";
import { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { colors, spacing } from "@/constants/theme";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";

const CARD_RADIUS = 14;

type TransactionReceiptImageProps = {
  url: string;
};

export function TransactionReceiptImage({ url }: TransactionReceiptImageProps) {
  return (
    <View style={styles.mediaCard}>
      <Image
        source={{ uri: url }}
        style={styles.receiptImage}
        contentFit="contain"
        accessibilityLabel="Receipt image"
      />
    </View>
  );
}

function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

type TransactionVoicePlayerProps = {
  url: string;
};

export function TransactionVoicePlayer({ url }: TransactionVoicePlayerProps) {
  const player = useAudioPlayer(url, { downloadFirst: true });
  const status = useAudioPlayerStatus(player);

  const togglePlayback = useCallback(() => {
    void triggerLightHaptic();
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  }, [player, status.playing]);

  const positionLabel = formatPlaybackTime(status.currentTime);
  const durationLabel =
    status.duration > 0 ? formatPlaybackTime(status.duration) : null;
  const timeText =
    durationLabel != null
      ? `${positionLabel} / ${durationLabel}`
      : positionLabel;

  return (
    <View style={styles.mediaCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          status.playing ? "Pause voice recording" : "Play voice recording"
        }
        onPress={togglePlayback}
        style={({ pressed }) => [
          styles.voiceRow,
          pressed && styles.voiceRowPressed,
        ]}
      >
        <View style={styles.playButton}>
          {status.playing ? (
            <Pause
              size={22}
              color={colors.textOnPrimary}
              strokeWidth={2}
              fill={colors.textOnPrimary}
            />
          ) : (
            <Play
              size={22}
              color={colors.textOnPrimary}
              strokeWidth={2}
              fill={colors.textOnPrimary}
            />
          )}
        </View>
        <View style={styles.voiceMeta}>
          <Text style={styles.voiceTitle}>Voice recording</Text>
          <Text style={styles.voiceTime}>{timeText}</Text>
          {status.isBuffering ? (
            <Text style={styles.voiceHint}>Loading…</Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  mediaCard: {
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  receiptImage: {
    width: "100%",
    height: 220,
    backgroundColor: colors.pageBackground,
  },
  voiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  voiceRowPressed: {
    opacity: 0.92,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.headerGradientStart,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceMeta: {
    flex: 1,
    gap: 2,
  },
  voiceTitle: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  voiceTime: {
    fontFamily: fontFamilies.mono,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  voiceHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
  },
});

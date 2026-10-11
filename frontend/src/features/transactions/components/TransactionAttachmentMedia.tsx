import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Image } from "expo-image";
import { ChevronRight, Images, Pause, Play } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, surfaces } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";

import { ReceiptImageViewer } from "./ReceiptImageViewer";

const CARD_RADIUS = 14;
const THUMB_SIZE = 56;

type TransactionReceiptImageProps = {
  url: string;
};

export function TransactionReceiptImage({ url }: TransactionReceiptImageProps) {
  const [viewerOpen, setViewerOpen] = useState(false);

  const openViewer = useCallback(() => {
    void triggerHaptic();
    setViewerOpen(true);
  }, []);

  const closeViewer = useCallback(() => {
    void triggerHaptic();
    setViewerOpen(false);
  }, []);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View receipt photo"
        onPress={openViewer}
        style={({ pressed }) => [
          styles.mediaCard,
          styles.receiptRow,
          pressed && styles.receiptRowPressed,
        ]}
      >
        <View style={styles.thumbShell}>
          <Image
            source={{ uri: url }}
            style={styles.thumbImage}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
          <View style={styles.thumbIconBadge}>
            <Images
              size={16}
              color={colors.headerGradientStart}
              strokeWidth={1.75}
            />
          </View>
        </View>
        <View style={styles.receiptMeta}>
          <Text style={styles.receiptTitle}>Receipt photo</Text>
          <Text style={styles.receiptHint}>Tap to view</Text>
        </View>
        <ChevronRight size={20} color={colors.inactive} strokeWidth={2} />
      </Pressable>

      <ReceiptImageViewer
        url={url}
        visible={viewerOpen}
        onClose={closeViewer}
      />
    </>
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
    void triggerHaptic();
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
    backgroundColor: colors.barBackground,
    overflow: "hidden",
  },
  receiptRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
  },
  receiptRowPressed: {
    opacity: 0.92,
  },
  thumbShell: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.pageBackground,
    flexShrink: 0,
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  thumbIconBadge: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    backgroundColor: surfaces.whiteOverlay92,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  receiptMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  receiptTitle: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  receiptHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
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

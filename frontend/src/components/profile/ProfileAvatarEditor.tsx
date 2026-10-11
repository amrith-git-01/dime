import { Image } from "expo-image";
import { RefreshCw } from "lucide-react-native";
import { memo, useCallback, useMemo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { fontFamilies } from "@/constants/fonts";
import { bento, colors, spacing } from "@/constants";
import { useAvatarRefreshAnimation } from "@/hooks/useAvatarRefreshAnimation";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";

const DEFAULT_AVATAR_SIZE = 96;

/** Place refresh FAB center on the avatar circle at bottom-right (45°). */
function refreshFabOnRingPosition(
  avatarSize: number,
  refreshFabSize: number,
): { left: number; top: number } {
  const radius = avatarSize / 2;
  const onRing = radius * Math.SQRT1_2;
  return {
    left: radius + onRing - refreshFabSize / 2,
    top: radius + onRing - refreshFabSize / 2,
  };
}

export type ProfileAvatarEditorProps = {
  avatarUrl: string;
  disabled?: boolean;
  onRefreshRandom: () => void;
  /** Avatar diameter; profile setup uses 120, account settings uses ~112. */
  avatarSize?: number;
  /** Refresh button diameter; default 44 (onboarding). */
  refreshFabSize?: number;
  /** Lucide icon size inside refresh button; default 18. */
  refreshIconSize?: number;
  hint?: string | null;
};

export const ProfileAvatarEditor = memo(function ProfileAvatarEditor({
  avatarUrl,
  disabled = false,
  onRefreshRandom,
  avatarSize = DEFAULT_AVATAR_SIZE,
  refreshFabSize = 44,
  refreshIconSize = 18,
  hint = "Tap refresh for a new random avatar.",
}: ProfileAvatarEditorProps) {
  const { avatarAnimatedStyle, runRefreshFeedback } =
    useAvatarRefreshAnimation();

  const fabPosition = useMemo(
    () => refreshFabOnRingPosition(avatarSize, refreshFabSize),
    [avatarSize, refreshFabSize],
  );

  const fabBleed = refreshFabSize / 2;
  const stageSize = avatarSize + fabBleed;

  const handleRefresh = useCallback(() => {
    void triggerHaptic();
    onRefreshRandom();
    runRefreshFeedback();
  }, [onRefreshRandom, runRefreshFeedback]);

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.avatarStage,
          { width: stageSize, height: stageSize, padding: fabBleed / 2 },
        ]}
      >
        <View
          style={[
            styles.avatarAnchor,
            { width: avatarSize, height: avatarSize },
          ]}
        >
          <Animated.View
            style={[
              styles.avatarRing,
              {
                width: avatarSize,
                height: avatarSize,
                borderRadius: avatarSize / 2,
              },
              avatarAnimatedStyle,
            ]}
          >
            <Image
              source={{ uri: avatarUrl }}
              style={styles.avatarImage}
              contentFit="cover"
              accessibilityLabel="Profile photo"
            />
          </Animated.View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New random avatar"
            hitSlop={8}
            disabled={disabled}
            onPress={handleRefresh}
            style={({ pressed }) => [
              styles.refreshFab,
              {
                left: fabPosition.left,
                top: fabPosition.top,
                width: refreshFabSize,
                height: refreshFabSize,
                borderRadius: refreshFabSize / 2,
              },
              pressed && !disabled ? styles.refreshFabPressed : null,
              disabled ? styles.refreshFabDisabled : null,
            ]}
          >
            <RefreshCw
              size={refreshIconSize}
              color={colors.primary}
              strokeWidth={2}
            />
          </Pressable>
        </View>
      </View>

      {hint ? (
        <Text
          style={styles.hint}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const fabShadowStyle = Platform.select({
  android: { elevation: 3 },
  default: {
    shadowColor: colors.shadowBrand,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
});

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    alignItems: "center",
    gap: spacing.md,
    overflow: "visible",
  },
  avatarStage: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  avatarAnchor: {
    position: "relative",
    overflow: "visible",
  },
  avatarRing: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.barBackground,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  refreshFab: {
    position: "absolute",
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.barBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...fabShadowStyle,
  },
  refreshFabPressed: {
    opacity: 0.92,
  },
  refreshFabDisabled: {
    opacity: 0.45,
  },
  hint: {
    alignSelf: "stretch",
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: bento.onPastel.muted,
    textAlign: "center",
  },
});

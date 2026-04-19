import { Image } from "expo-image";
import { Bell, Settings } from "lucide-react-native";
import { useCallback, useId, useRef, useState } from "react";
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { colors, hero, overlays, spacing, typography } from "@/constants";
import { useUserProfile } from "@/hooks/useUserProfile";

export type AppHeaderProps = {
  onNotificationsPress: () => void;
  onSettingsPress?: () => void;
  onHeaderReady?: () => void;
};

const AVATAR_SIZE = 40;
const BELL_ICON = 20;
const BELL_CIRCLE = 36;

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour <= 11) return "Good morning";
  if (hour >= 12 && hour <= 17) return "Good afternoon";
  return "Good evening";
}

export function AppHeader({
  onNotificationsPress,
  onSettingsPress,
  onHeaderReady,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const { displayName, avatarUrl, loading, fetchError } = useUserProfile();
  const greeting = timeOfDayGreeting();
  const gradientId = `appHeaderGrad_${useId().replace(/:/g, "")}`;
  const [headerSize, setHeaderSize] = useState({ w: 0, h: 0 });
  const [avatarImageLoading, setAvatarImageLoading] = useState(true);
  const [avatarImageError, setAvatarImageError] = useState(false);
  const headerReadyNotifiedRef = useRef(false);

  const onHeaderLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setHeaderSize({ w: width, h: height });
      if (!headerReadyNotifiedRef.current && width > 0 && height > 0) {
        headerReadyNotifiedRef.current = true;
        onHeaderReady?.();
      }
    },
    [onHeaderReady],
  );

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.gradientShell,
          {
            borderBottomLeftRadius: spacing.headerCurveRadius,
            borderBottomRightRadius: spacing.headerCurveRadius,
          },
        ]}
        onLayout={onHeaderLayout}
      >
        {headerSize.w > 0 && headerSize.h > 0 ? (
          <Svg
            width={headerSize.w}
            height={headerSize.h}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          >
            <Defs>
              <LinearGradient
                id={gradientId}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <Stop offset="0%" stopColor={colors.headerGradientStart} />
                <Stop offset="100%" stopColor={colors.headerGradientEnd} />
              </LinearGradient>
            </Defs>
            <Rect
              x={0}
              y={0}
              width={headerSize.w}
              height={headerSize.h}
              fill={`url(#${gradientId})`}
            />
          </Svg>
        ) : null}

        <View
          style={[
            styles.gradientInner,
            { paddingTop: insets.top + spacing.lg },
          ]}
        >
          <View style={styles.row}>
            {loading ? (
              <View style={styles.avatarSkeleton} />
            ) : (
              <View style={styles.avatarRing}>
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.avatar}
                  accessibilityLabel="Profile avatar"
                  onLoadStart={() => {
                    setAvatarImageLoading(true);
                    setAvatarImageError(false);
                  }}
                  onLoad={() => {
                    setAvatarImageLoading(false);
                    setAvatarImageError(false);
                  }}
                  onError={() => {
                    setAvatarImageLoading(false);
                    setAvatarImageError(true);
                  }}
                />
                {avatarImageLoading ? (
                  <View style={styles.avatarSpinnerWrap}>
                    <ActivityIndicator
                      size="small"
                      color={colors.textOnPrimary}
                    />
                  </View>
                ) : null}
                {avatarImageError ? (
                  <View style={styles.avatarErrorTint} />
                ) : null}
              </View>
            )}

            <View style={styles.titles} accessibilityRole="header">
              <Text style={styles.greeting}>{greeting}</Text>
              {loading ? (
                <View style={styles.nameBlock}>
                  <View style={styles.nameLineShort} />
                  <View style={styles.nameLineLong} />
                </View>
              ) : (
                <Text style={styles.displayName} numberOfLines={1}>
                  {displayName.length > 0 ? displayName : "You"}
                </Text>
              )}
            </View>

            <View style={styles.spacer} />

            {onSettingsPress ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Settings"
                hitSlop={8}
                onPress={onSettingsPress}
                style={({ pressed }) => [
                  styles.bellCircle,
                  pressed && styles.bellPressed,
                  styles.headerIconGap,
                ]}
              >
                <Settings
                  size={BELL_ICON}
                  color={colors.textOnPrimary}
                  strokeWidth={1.5}
                />
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              hitSlop={8}
              onPress={onNotificationsPress}
              style={({ pressed }) => [
                styles.bellCircle,
                pressed && styles.bellPressed,
              ]}
            >
              <Bell
                size={BELL_ICON}
                color={colors.textOnPrimary}
                strokeWidth={1.5}
              />
            </Pressable>
          </View>
        </View>
      </View>

      {fetchError ? (
        <Text style={styles.errorHint}>
          Profile could not be refreshed. Showing account defaults.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    alignSelf: "stretch",
    flexShrink: 0,
    position: "relative",
  },
  gradientShell: {
    width: "100%",
    overflow: "hidden",
  },
  gradientInner: {
    width: "100%",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
  },
  avatarRing: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.headerAvatarRingBorder,
    backgroundColor: hero.avatarRing,
    overflow: "hidden",
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
  avatarSpinnerWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: overlays.avatarFallback,
  },
  avatarErrorTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: overlays.avatarError,
  },
  avatarSkeleton: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: overlays.avatarSkeleton,
  },
  titles: {
    flex: 1,
    marginLeft: spacing.md,
    minWidth: 0,
  },
  greeting: {
    ...typography.headerGreetingLine,
  },
  displayName: {
    ...typography.headerUsernameLine,
    marginTop: 2,
  },
  nameBlock: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  nameLineShort: {
    height: 10,
    width: "45%",
    borderRadius: 5,
    backgroundColor: hero.skeletonShort,
  },
  nameLineLong: {
    height: 14,
    width: "70%",
    borderRadius: 7,
    backgroundColor: hero.skeletonLong,
  },
  spacer: {
    width: spacing.sm,
  },
  bellCircle: {
    width: BELL_CIRCLE,
    height: BELL_CIRCLE,
    borderRadius: BELL_CIRCLE / 2,
    backgroundColor: colors.headerBellCircleBg,
    alignItems: "center",
    justifyContent: "center",
  },
  bellPressed: {
    opacity: 0.85,
  },
  headerIconGap: {
    marginRight: spacing.sm,
  },
  errorHint: {
    ...typography.screenSubtitle,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    color: colors.textSecondary,
  },
});

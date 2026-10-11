import { Image } from "expo-image";
import { Bell, Settings } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  danger,
  ink,
  inkFaint,
  inkSoft,
  overlays,
  skeleton,
  surface,
} from "@/constants/colors";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { shadows } from "@/constants/shadows";
import { spacing } from "@/constants/spacing";
import { useUserProfile } from "@/hooks/useUserProfile";

export type AppHeaderProps = {
  onNotificationsPress: () => void;
  onSettingsPress?: () => void;
  onHeaderReady?: () => void;
  showUnreadNotificationDot?: boolean;
};

const AVATAR_SIZE = 40;
const ICON_SIZE = 20;
const UNREAD_DOT_SIZE = 8;

function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h <= 11) return "Good morning";
  if (h >= 12 && h <= 17) return "Good afternoon";
  return "Good evening";
}

export function AppHeader({
  onNotificationsPress,
  onSettingsPress,
  onHeaderReady,
  showUnreadNotificationDot = false,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const { displayName, avatarUrl, loading, fetchError } = useUserProfile();
  const [imgLoading, setImgLoading] = useState(true);
  const [imgError, setImgError] = useState(false);
  const notifiedRef = useRef(false);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      if (!notifiedRef.current && width > 0 && height > 0) {
        notifiedRef.current = true;
        onHeaderReady?.();
      }
    },
    [onHeaderReady],
  );

  return (
    <View
      style={[styles.header, { paddingTop: insets.top + spacing.sm }]}
      onLayout={onLayout}
    >
      <View style={styles.row}>
        {/* Avatar */}
        {loading ? (
          <View style={styles.avatarSkeleton} />
        ) : (
          <View style={styles.avatar}>
            <Image
              source={{ uri: avatarUrl }}
              style={styles.avatarImg}
              accessibilityLabel="Profile avatar"
              cachePolicy="memory-disk"
              onLoadStart={() => {
                setImgLoading(true);
                setImgError(false);
              }}
              onLoad={() => setImgLoading(false)}
              onError={() => {
                setImgLoading(false);
                setImgError(true);
              }}
            />
            {imgLoading && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator size="small" color={inkFaint} />
              </View>
            )}
            {imgError && (
              <View style={[styles.avatarOverlay, styles.avatarError]} />
            )}
          </View>
        )}

        {/* Greeting + name */}
        <View style={styles.titles} accessibilityRole="header">
          <Text style={styles.greetingText}>{greeting()}</Text>
          {loading ? (
            <View style={styles.nameSkeleton}>
              <View style={[styles.nameSkeletonBar, { width: "45%" }]} />
              <View
                style={[styles.nameSkeletonBar, { width: "70%", height: 14 }]}
              />
            </View>
          ) : (
            <Text style={styles.nameText} numberOfLines={1}>
              {displayName.length > 0 ? displayName : "You"}
            </Text>
          )}
        </View>

        {/* Icon buttons */}
        {onSettingsPress && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={spacing.sm}
            onPress={onSettingsPress}
            style={({ pressed }) => [
              styles.iconBtn,
              styles.iconGap,
              pressed && styles.iconBtnPressed,
            ]}
          >
            <Settings size={ICON_SIZE} color={inkSoft} strokeWidth={1.5} />
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          hitSlop={spacing.sm}
          onPress={onNotificationsPress}
          style={({ pressed }) => [
            styles.iconBtn,
            pressed && styles.iconBtnPressed,
          ]}
        >
          <Bell size={ICON_SIZE} color={inkSoft} strokeWidth={1.5} />
          {showUnreadNotificationDot && <View style={styles.unreadDot} />}
        </Pressable>
      </View>

      {fetchError && (
        <Text style={styles.errorHint}>
          Profile could not be refreshed. Showing account defaults.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: surface,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    ...shadows.header,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 48,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: "hidden",
    backgroundColor: skeleton.surface,
    ...shadows.card,
  },
  avatarImg: {
    width: "100%",
    height: "100%",
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: overlays.avatarFallback,
  },
  avatarError: {
    backgroundColor: overlays.avatarError,
  },
  avatarSkeleton: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: skeleton.surface,
  },
  titles: {
    flex: 1,
    minWidth: 0,
  },
  greetingText: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: inkSoft,
  },
  nameText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.18,
    color: ink,
    marginTop: 1,
  },
  nameSkeleton: {
    marginTop: 4,
    gap: 4,
  },
  nameSkeletonBar: {
    height: 10,
    borderRadius: 4,
    backgroundColor: skeleton.surface,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  iconBtnPressed: {
    opacity: 0.6,
  },
  iconGap: {
    marginRight: 4,
  },
  unreadDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: UNREAD_DOT_SIZE,
    height: UNREAD_DOT_SIZE,
    borderRadius: UNREAD_DOT_SIZE / 2,
    backgroundColor: danger,
  },
  errorHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: inkSoft,
    paddingTop: spacing.sm,
    paddingBottom: 4,
  },
});

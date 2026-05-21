import { Image } from "expo-image";
import { ChevronRight } from "lucide-react-native";
import { memo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { bento, colors, radius, spacing, surfaces } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import { SETTINGS_HERO_AVATAR_SIZE } from "./settingsBentoTokens";

const cardShadowStyle = Platform.select({
  android: { elevation: 2 },
  default: {
    shadowColor: bento.surface.lavender,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
  },
});

export type SettingsHubHeroProps = {
  displayName: string;
  avatarUrl: string;
  onPress: () => void;
};

export const SettingsHubHero = memo(function SettingsHubHero({
  displayName,
  avatarUrl,
  onPress,
}: SettingsHubHeroProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Account and profile"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        cardShadowStyle,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.avatarRing}>
        <Image
          source={{ uri: avatarUrl }}
          style={styles.avatar}
          accessibilityLabel="Profile photo"
        />
      </View>

      <View style={styles.textCol}>
        <Text style={styles.kicker}>Your account</Text>
        <Text style={styles.name} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          Profile & display name
        </Text>
      </View>

      <View style={styles.chevronWrap}>
        <ChevronRight
          size={22}
          color={colors.brandPrimary}
          strokeWidth={2.25}
        />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: bento.twoToneHeaderSurface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: "visible",
  },
  pressed: {
    opacity: 0.88,
  },
  avatarRing: {
    padding: 3,
    borderRadius: radius.full,
    backgroundColor: colors.barBackground,
    borderWidth: 2,
    borderColor: surfaces.primaryBorder28,
  },
  avatar: {
    width: SETTINGS_HERO_AVATAR_SIZE,
    height: SETTINGS_HERO_AVATAR_SIZE,
    borderRadius: SETTINGS_HERO_AVATAR_SIZE / 2,
    backgroundColor: bento.twoToneBodySurface,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  kicker: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: colors.brandPrimary,
  },
  name: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 20,
    lineHeight: 26,
    color: bento.onPastel.primary,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: bento.onPastel.muted,
  },
  chevronWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: surfaces.primaryTint10,
  },
});

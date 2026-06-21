import { Image } from "expo-image";
import { ChevronRight } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ink, inkFaint, inkSoft, line, radius, shadows, spacing, surface } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import { SETTINGS_HERO_AVATAR_SIZE } from "./settingsBentoTokens";

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
        shadows.card,
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

      <ChevronRight size={20} color={inkFaint} strokeWidth={2} />
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
    backgroundColor: surface,
    overflow: "visible",
  },
  pressed: {
    opacity: 0.88,
  },
  avatarRing: {
    padding: 3,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: line,
  },
  avatar: {
    width: SETTINGS_HERO_AVATAR_SIZE,
    height: SETTINGS_HERO_AVATAR_SIZE,
    borderRadius: SETTINGS_HERO_AVATAR_SIZE / 2,
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
    color: inkSoft,
  },
  name: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 20,
    lineHeight: 26,
    color: ink,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: inkSoft,
  },
});

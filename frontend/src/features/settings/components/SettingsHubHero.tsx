import { Image } from "expo-image";
import { ChevronRight } from "lucide-react-native";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";

import { SETTINGS_HERO_AVATAR_SIZE } from "../constants/settingsTokens";
import { createThemedStyles, useTheme } from "@/theme";

export type SettingsHubHeroProps = {
  displayName: string;
  email: string | null;
  avatarUrl: string;
  onPress: () => void;
};

export const SettingsHubHero = memo(function SettingsHubHero({
  displayName,
  email,
  avatarUrl,
  onPress,
}: SettingsHubHeroProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Account and profile"
      onPress={() => {
        void triggerHaptic();
        onPress();
      }}
      android_ripple={{ color: "transparent" }}
      style={styles.row}
    >
      <Image
        source={{ uri: avatarUrl }}
        style={styles.avatar}
        accessibilityLabel="Profile photo"
      />

      <View style={styles.textCol}>
        <Text style={styles.name} numberOfLines={1}>
          {displayName}
        </Text>
        {email ? (
          <Text style={styles.email} numberOfLines={1}>
            {email}
          </Text>
        ) : null}
      </View>

      <ChevronRight size={20} color={colors.inkFaint} strokeWidth={2} />
    </Pressable>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    minHeight: 56,
    borderRadius: radius.sm,
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
  name: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.ink,
  },
  email: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
}));

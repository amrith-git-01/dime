import { HeaderBackButton, getHeaderTitle } from "@react-navigation/elements";
import type { NativeStackHeaderProps } from "@react-navigation/native-stack";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { createThemedStyles, useTheme } from "@/theme";

export function ScreenHeader({
  options,
  route,
  back,
  navigation,
}: NativeStackHeaderProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const title = getHeaderTitle(options, route.name);

  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.row}>
        {back && (
          <HeaderBackButton
            tintColor={colors.ink}
            displayMode="minimal"
            onPress={navigation.goBack}
            pressColor="transparent"
            pressOpacity={1}
            style={styles.backBtn}
          />
        )}
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  header: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    ...shadows.header,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
  },
  backBtn: {
    marginStart: spacing.xs,
  },
  title: {
    flex: 1,
    marginStart: spacing.sm,
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.2,
    color: colors.ink,
  },
}));

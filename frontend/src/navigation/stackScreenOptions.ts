import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";

import { colors } from "@/constants/theme";

export const stackScreenOptions: NativeStackNavigationOptions = {
  headerShown: true,
  headerTintColor: colors.primary,
  headerStyle: { backgroundColor: colors.pageBackground },
  headerShadowVisible: false,
};

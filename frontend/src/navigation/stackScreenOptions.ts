import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { createElement } from "react";

import { ScreenHeader } from "@/components/layout/ScreenHeader";

export const stackScreenOptions: NativeStackNavigationOptions = {
  headerShown: true,
  headerShadowVisible: false,
  header: (props) => createElement(ScreenHeader, props),
};

import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { createElement } from "react";

import { StackBrandedHeader } from "@/components/layout/StackBrandedHeader";

export const stackScreenOptions: NativeStackNavigationOptions = {
  headerShown: true,
  headerShadowVisible: false,
  header: (props) => createElement(StackBrandedHeader, props),
};

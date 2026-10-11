import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

import { DimeTabBarItem } from "./DimeTabBarItem";
import { tabLabel } from "./dimeTabBarConfig";

type DimeTabBarRouteItemProps = {
  route: BottomTabBarProps["state"]["routes"][number];
  options: BottomTabBarProps["descriptors"][string]["options"];
  isFocused: boolean;
  navigation: BottomTabBarProps["navigation"];
};

/** A tab-bar item wired to React Navigation's tabPress / tabLongPress events. */
export function DimeTabBarRouteItem({
  route,
  options,
  isFocused,
  navigation,
}: DimeTabBarRouteItemProps) {
  const onPress = () => {
    const event = navigation.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  };

  const onLongPress = () => {
    navigation.emit({ type: "tabLongPress", target: route.key });
  };

  return (
    <DimeTabBarItem
      routeName={route.name}
      label={tabLabel(options, route.name)}
      isFocused={isFocused}
      onPress={onPress}
      onLongPress={onLongPress}
    />
  );
}

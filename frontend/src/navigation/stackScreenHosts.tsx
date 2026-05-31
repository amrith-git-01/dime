import { Suspense, lazy, type ComponentType } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import {
  StackScreenShell,
  type StackScreenShellProps,
} from "@/components/layout/StackScreenShell";
import { colors } from "@/constants";

type StackShellConfig = Omit<StackScreenShellProps, "children">;

export function StackScreenLoadingFallback() {
  return (
    <View style={loadingFallbackStyles.root}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function withStackScreen<P extends object>(
  Screen: ComponentType<P>,
  shellConfig?: StackShellConfig,
): ComponentType<P> {
  function StackScreenHost(props: P) {
    return (
      <StackScreenShell {...shellConfig}>
        <Screen {...props} />
      </StackScreenShell>
    );
  }

  StackScreenHost.displayName = `StackScreen(${
    Screen.displayName ?? Screen.name ?? "Component"
  })`;

  return StackScreenHost;
}

export function lazyStackScreen<P extends object>(
  factory: () => Promise<{ default: ComponentType<P> }>,
  shellConfig?: StackShellConfig,
): ComponentType<P> {
  const LazyScreen = lazy(async () => {
    const loaded = await factory();
    const Screen = loaded.default;
    if (!Screen) {
      throw new Error("Stack screen module must default-export a component");
    }

    function LazyStackScreenContent(props: P) {
      return (
        <StackScreenShell {...shellConfig}>
          <Screen {...props} />
        </StackScreenShell>
      );
    }

    LazyStackScreenContent.displayName = `LazyStackScreen(${
      Screen.displayName ?? Screen.name ?? "Component"
    })`;

    return { default: LazyStackScreenContent };
  });

  function LazyStackScreenHost(props: P) {
    return (
      <Suspense fallback={<StackScreenLoadingFallback />}>
        <LazyScreen {...props} />
      </Suspense>
    );
  }

  LazyStackScreenHost.displayName = "LazyStackScreenHost";

  return LazyStackScreenHost;
}

const loadingFallbackStyles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.pageBackground,
  },
});

import { Suspense, lazy, type ComponentType } from "react";
import {
  ActivityIndicator,
  InteractionManager,
  StyleSheet,
  View,
} from "react-native";

import {
  StackScreenShell,
  type StackScreenShellProps,
} from "@/components/layout/StackScreenShell";
import { colors } from "@/constants";

import { stackScreenModules } from "./stackScreenModules";

type StackShellConfig = Omit<StackScreenShellProps, "children">;

type StackScreenModule = { default: ComponentType<object> };
type StackScreenLoader = () => Promise<StackScreenModule>;

const warmedScreenLoaders = new WeakMap<
  StackScreenLoader,
  Promise<StackScreenModule>
>();

function warmStackScreenLoader(
  loader: StackScreenLoader,
): Promise<StackScreenModule> {
  const existing = warmedScreenLoaders.get(loader);
  if (existing) {
    return existing;
  }
  const pending = loader();
  warmedScreenLoaders.set(loader, pending);
  return pending;
}

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

export function preloadStackScreens(): Promise<
  PromiseSettledResult<StackScreenModule>[]
> {
  return Promise.allSettled(
    Object.values(stackScreenModules).map((load) =>
      warmStackScreenLoader(load),
    ),
  );
}

/** Warm stack screen JS after the main tab shell is up (same promises as ``lazyStackScreen``). */
export function scheduleStackScreenPreload(): () => void {
  const handle = InteractionManager.runAfterInteractions(() => {
    void preloadStackScreens();
  });
  return () => handle.cancel();
}

export function lazyStackScreen<P extends object>(
  factory: StackScreenLoader,
  shellConfig?: StackShellConfig,
): ComponentType<P> {
  const LazyScreen = lazy(async () => {
    const loaded = await warmStackScreenLoader(factory);
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

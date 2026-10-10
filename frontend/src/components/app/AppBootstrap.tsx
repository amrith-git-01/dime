import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { prefetchSiblingTabQueries } from "@/lib/appBootstrap";
import { readStoredAuthSession } from "@/lib/auth/authStorage";

import { SplashBrandedShell } from "./SplashBrandedShell";
import { useSplashReveal } from "./SplashRevealContext";

type AppBootstrapProps = {
  fontsReady: boolean;
  children: ReactNode;
};

/**
 * Shows branded splash while fonts load. Native splash stays up until
 * fonts, layout, and auth/profile gate are ready (see App.tsx).
 */
export function AppBootstrap({ fontsReady, children }: AppBootstrapProps) {
  const queryClient = useQueryClient();
  const { setLayoutReady } = useSplashReveal();
  const prefetchedRef = useRef(false);

  const onFirstLayout = useCallback(() => {
    setLayoutReady(true);

    if (!fontsReady || prefetchedRef.current) {
      return;
    }

    const userId = readStoredAuthSession()?.user.id;
    if (!userId) {
      return;
    }

    prefetchedRef.current = true;
    prefetchSiblingTabQueries(queryClient, userId);
  }, [fontsReady, queryClient, setLayoutReady]);

  if (!fontsReady) {
    return <SplashBrandedShell />;
  }

  return (
    <View style={styles.root} onLayout={onFirstLayout}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

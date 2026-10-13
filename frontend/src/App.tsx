import { useBlurFocusedInputOnKeyboardHide } from "@/hooks/useBlurFocusedInputOnKeyboardHide";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { NavigationContainer } from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import { persistQueryClientSubscribe } from "@tanstack/react-query-persist-client";
import { useFonts } from "expo-font";
import * as NavigationBar from "expo-navigation-bar";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppBootstrap } from "@/components/app/AppBootstrap";
import { AppErrorBoundary } from "@/components/app/AppErrorBoundary";
import { SplashBrandedShell } from "@/components/app/SplashBrandedShell";
import {
  SplashRevealProvider,
  useSplashReveal,
} from "@/components/app/SplashRevealContext";
import { ToastHost } from "@/components/toast/ToastHost";
import { colors } from "@/constants";
import { loadableAppFonts } from "@/constants/fonts";
import {
  SPLASH_MIN_DISPLAY_MS,
  SPLASH_SHELL_TIMEOUT_MS,
  splashBackgroundColor,
} from "@/constants/splash";
import {
  ReceiptScanBusyOverlay,
  VoiceCaptureBar,
} from "@/features/transactions/components";
import {
  createAppQueryClient,
  subscribeQueryClientLifecycle,
} from "@/lib/appBootstrap";
import { configureExpoNotifications } from "@/lib/notifications/expoNotificationsSetup";
import { useNotificationOpenHandler } from "@/lib/notifications/useNotificationOpenHandler";
import { appQueryPersistOptions } from "@/lib/queryPersister";
import RootNavigator from "@/navigation/RootNavigator";
import { navigationRef } from "@/navigation/navigationRef";
import { appNavigationTheme } from "@/navigation/theme";
import { reportError } from "@/lib/reportError";

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
});
WebBrowser.maybeCompleteAuthSession();

/** Survives remounts of the coordinator: once the splash is gone it must never come back. */
let splashRevealedLatch = false;

function AppSplashCoordinator({
  fontsReady,
  children,
}: {
  fontsReady: boolean;
  children: ReactNode;
}) {
  const { contentReady, layoutReady, shellReady } = useSplashReveal();
  const splashStartedAtRef = useRef(Date.now());
  const [splashRevealed, setSplashRevealed] = useState(splashRevealedLatch);

  const bootstrapReady = fontsReady && layoutReady && contentReady;

  // The splash is the single loading cover: it goes once bootstrap AND the first screen's shell
  // (header + tab bar, or the auth / onboarding route) are laid out. The timeout keeps a shell
  // that never reports from holding it forever.
  useEffect(() => {
    if (!bootstrapReady || splashRevealed) {
      return;
    }

    const elapsed = Date.now() - splashStartedAtRef.current;
    const remaining = Math.max(0, SPLASH_MIN_DISPLAY_MS - elapsed);
    const delay = shellReady
      ? remaining
      : Math.max(remaining, SPLASH_SHELL_TIMEOUT_MS);

    const timer = setTimeout(() => {
      splashRevealedLatch = true;
      void SplashScreen.hideAsync();
      setSplashRevealed(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [bootstrapReady, shellReady, splashRevealed]);

  return (
    <View style={styles.splashCoordinator}>
      <AppBootstrap fontsReady={fontsReady}>{children}</AppBootstrap>
      {!splashRevealed ? (
        <View style={styles.splashOverlay} pointerEvents="auto">
          <SplashBrandedShell />
        </View>
      ) : null}
    </View>
  );
}

function AppRoot() {
  useBlurFocusedInputOnKeyboardHide();
  const { handleNavigationReady } = useNotificationOpenHandler();

  return (
    <>
      <NavigationContainer
        ref={navigationRef}
        theme={appNavigationTheme}
        onReady={handleNavigationReady}
      >
        <RootNavigator />
        <ReceiptScanBusyOverlay />
        <VoiceCaptureBar />
      </NavigationContainer>
      <ToastHost />
    </>
  );
}

export default function App() {
  const [queryClient] = useState(() => createAppQueryClient());
  const [fontsLoaded, fontError] = useFonts(loadableAppFonts);

  useEffect(() => {
    configureExpoNotifications();
  }, []);

  useEffect(() => subscribeQueryClientLifecycle(queryClient), [queryClient]);

  useEffect(() => {
    return persistQueryClientSubscribe({
      queryClient,
      ...appQueryPersistOptions,
    });
  }, [queryClient]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(splashBackgroundColor);

    if (Platform.OS !== "android") {
      return;
    }

    // Edge-to-edge: nav bar is transparent; root view bg shows through.
    // setBackgroundColorAsync is unsupported — only set button contrast.
    NavigationBar.setStyle("light");
  }, []);

  useEffect(() => {
    if (fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontError]);

  if (fontError) {
    reportError(fontError, "App useFonts failed");
    return (
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <View style={styles.fontError}>
            <Text style={styles.fontErrorText}>
              Could not load fonts. Close and reopen the app.
            </Text>
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <AppErrorBoundary>
            <SplashRevealProvider>
              <KeyboardProvider>
                <AppSplashCoordinator fontsReady={fontsLoaded}>
                  <AppRoot />
                </AppSplashCoordinator>
              </KeyboardProvider>
            </SplashRevealProvider>
          </AppErrorBoundary>
          <StatusBar style="auto" />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  splashCoordinator: {
    flex: 1,
  },
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  root: {
    flex: 1,
    backgroundColor: colors.pageBackground,
  },
  fontError: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  fontErrorText: {
    fontSize: 16,
    textAlign: "center",
  },
});

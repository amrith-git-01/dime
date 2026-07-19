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
  splashBackgroundColor,
} from "@/constants/splash";
import {
  ReceiptScanBusyOverlay,
  VoiceCaptureBar,
} from "@/features/transactions/components";
import {
  appQueryPersistOptions,
  createAppQueryClient,
} from "@/lib/appBootstrap";
import { configureExpoNotifications } from "@/lib/notifications/expoNotificationsSetup";
import { useNotificationOpenHandler } from "@/lib/notifications/useNotificationOpenHandler";
import RootNavigator from "@/navigation/RootNavigator";
import { navigationRef } from "@/navigation/navigationRef";
import { appNavigationTheme } from "@/navigation/theme";

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
});
WebBrowser.maybeCompleteAuthSession();

function AppSplashCoordinator({
  fontsReady,
  children,
}: {
  fontsReady: boolean;
  children: ReactNode;
}) {
  const { contentReady, layoutReady } = useSplashReveal();
  const splashStartedAtRef = useRef(Date.now());
  const [splashRevealed, setSplashRevealed] = useState(false);

  const bootstrapReady = fontsReady && layoutReady && contentReady;

  useEffect(() => {
    if (!bootstrapReady || splashRevealed) {
      return;
    }

    const elapsed = Date.now() - splashStartedAtRef.current;
    const remaining = Math.max(0, SPLASH_MIN_DISPLAY_MS - elapsed);

    const timer = setTimeout(() => {
      void SplashScreen.hideAsync();
      setSplashRevealed(true);
    }, remaining);

    return () => clearTimeout(timer);
  }, [bootstrapReady, splashRevealed]);

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
  useNotificationOpenHandler();

  return (
    <>
      <NavigationContainer ref={navigationRef} theme={appNavigationTheme}>
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
    console.error("[App] useFonts failed:", fontError);
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
          <SplashRevealProvider>
            <KeyboardProvider>
              <AppSplashCoordinator fontsReady={fontsLoaded}>
                <AppRoot />
              </AppSplashCoordinator>
            </KeyboardProvider>
          </SplashRevealProvider>
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

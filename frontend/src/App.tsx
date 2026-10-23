import { useBlurFocusedInputOnKeyboardHide } from "@/hooks/useBlurFocusedInputOnKeyboardHide";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { NavigationContainer } from "@react-navigation/native";
import { onlineManager, QueryClientProvider } from "@tanstack/react-query";
import { persistQueryClientSubscribe } from "@tanstack/react-query-persist-client";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppBootstrap } from "@/components/app/AppBootstrap";
import { AppErrorBoundary } from "@/components/app/AppErrorBoundary";
import { computeSplashRevealDelayMs } from "@/components/app/splashRevealDelay";
import { SplashBrandedShell } from "@/components/app/SplashBrandedShell";
import {
  SplashRevealProvider,
  useSplashReveal,
} from "@/components/app/SplashRevealContext";
import { CelebrationLayer } from "@/components/celebrations/CelebrationLayer";
import { ToastHost } from "@/components/toast/ToastHost";
import { loadableAppFonts } from "@/constants/fonts";
import { AppTourOverlay } from "@/features/appTour/components";
import { PendingSheet } from "@/features/outbox/components/PendingSheet";
import { invalidateTransactionDerivedQueries } from "@/features/transactions/cache/invalidateTransactionQueries";
import {
  ReceiptScanBusyOverlay,
  VoiceCaptureBar,
} from "@/features/transactions/components";
import {
  createAppQueryClient,
  subscribeQueryClientLifecycle,
} from "@/lib/appBootstrap";
import { useDeepLinkHandler } from "@/lib/deepLinks/useDeepLinkHandler";
import { configureExpoNotifications } from "@/lib/notifications/expoNotificationsSetup";
import { useNotificationOpenHandler } from "@/lib/notifications/useNotificationOpenHandler";
import { startOutboxSync } from "@/lib/outbox/outboxSync";
import { appQueryPersistOptions } from "@/lib/queryPersister";
import { removeLegacyWidgetPresets } from "@/lib/widgets/legacyWidgetData";
import { onWidgetTransactionsChanged } from "@/lib/widgets/widgetCaptureEvents";
import { subscribeWidgetSnapshotWriter } from "@/lib/widgets/widgetSnapshotWriter";
import RootNavigator from "@/navigation/RootNavigator";
import { navigationRef } from "@/navigation/navigationRef";
import { getNavigationTheme } from "@/navigation/theme";
import { reportError } from "@/lib/reportError";
import { useAuthSessionStore } from "@/stores/authSessionStore";
import { createThemedStyles, ThemeProvider, useTheme } from "@/theme";

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
  const styles = useStyles();
  const { contentReady, layoutReady, shellReady, markSplashRevealed } =
    useSplashReveal();
  const splashStartedAtRef = useRef(Date.now());
  const [splashRevealed, setSplashRevealed] = useState(splashRevealedLatch);

  // The release timer runs as soon as fonts and layout are ready, whatever the content (profile
  // gate) is doing; `bootstrapReady` only decides whether it can release early.
  const timerReady = fontsReady && layoutReady;
  const bootstrapReady = timerReady && contentReady;

  // Lets the rest of the app (the guided tour) wait until the splash is actually gone.
  useEffect(() => {
    if (splashRevealed) {
      markSplashRevealed();
    }
  }, [splashRevealed, markSplashRevealed]);

  // The splash is the single loading cover: it goes once bootstrap AND the first screen's shell
  // (header + tab bar, or the auth / onboarding route) are laid out, and not before the minimum
  // display time. Only the long safety cap releases it otherwise, so a broken start cannot hold
  // it forever. The native fade starts on the frame after the ready signal, so it never overlaps
  // a frame that has not been committed yet.
  useEffect(() => {
    if (!timerReady || splashRevealed) {
      return;
    }

    const ready = bootstrapReady && shellReady;
    const delay = computeSplashRevealDelayMs({
      now: Date.now(),
      splashStartedAt: splashStartedAtRef.current,
      ready,
    });

    let frame: number | undefined;
    const timer = setTimeout(() => {
      // Offline, a slow start is expected (the profile check cannot finish): not worth reporting.
      if (!ready && onlineManager.isOnline()) {
        reportError(new Error("Splash safety cap reached"), "App splash");
      }
      frame = requestAnimationFrame(() => {
        splashRevealedLatch = true;
        void SplashScreen.hideAsync();
        setSplashRevealed(true);
      });
    }, delay);

    return () => {
      clearTimeout(timer);
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
    };
  }, [timerReady, bootstrapReady, shellReady, splashRevealed]);

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
  const { handleNavigationReady: handleNotificationsReady } =
    useNotificationOpenHandler();
  const { handleNavigationReady: handleDeepLinksReady } = useDeepLinkHandler();
  const { scheme } = useTheme();
  const handleNavigationReady = () => {
    handleNotificationsReady();
    handleDeepLinksReady();
  };

  return (
    <>
      <NavigationContainer
        ref={navigationRef}
        theme={getNavigationTheme(scheme)}
        onReady={handleNavigationReady}
      >
        <RootNavigator />
        <ReceiptScanBusyOverlay />
        <VoiceCaptureBar />
        <PendingSheet />
      </NavigationContainer>
      <ToastHost />
      <AppTourOverlay />
      <CelebrationLayer />
    </>
  );
}

function AppContent() {
  const styles = useStyles();
  const [queryClient] = useState(() => createAppQueryClient());
  const [fontsLoaded, fontError] = useFonts(loadableAppFonts);

  useEffect(() => {
    configureExpoNotifications();
  }, []);

  useEffect(() => subscribeQueryClientLifecycle(queryClient), [queryClient]);

  // Sends the writes saved while offline (manual adds, voice notes, receipt photos) when the server is reachable.
  useEffect(() => startOutboxSync(queryClient), [queryClient]);

  // Keeps the Android home-screen widgets' snapshot in step with the cache.
  useEffect(() => subscribeWidgetSnapshotWriter(queryClient), [queryClient]);

  // The widget's capture card saves in this same JS runtime: refetch what it added. (Also keeps the
  // snapshot writer above from overwriting the card's fresher numbers with stale cached ones.)
  useEffect(
    () =>
      onWidgetTransactionsChanged(() => {
        if (useAuthSessionStore.getState().userId) {
          invalidateTransactionDerivedQueries(queryClient);
        }
      }),
    [queryClient],
  );

  // 1.1.0 kept one-tap presets on disk; send any tap still queued there once, then delete the store.
  useEffect(() => {
    void removeLegacyWidgetPresets();
  }, []);

  useEffect(() => {
    return persistQueryClientSubscribe({
      queryClient,
      ...appQueryPersistOptions,
    });
  }, [queryClient]);

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
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

/** Theme sits outside everything so the app root, bars and navigation all read one scheme. */
export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  splashCoordinator: {
    flex: 1,
  },
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  root: {
    flex: 1,
    backgroundColor: colors.paper,
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
}));

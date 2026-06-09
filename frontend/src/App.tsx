import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { NavigationContainer } from "@react-navigation/native";
import {
  MutationCache,
  QueryCache,
  QueryClient,
} from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useFonts } from "expo-font";
import * as NavigationBar from "expo-navigation-bar";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ToastHost } from "@/components/toast/ToastHost";
import { colors } from "@/constants";
import { loadableAppFonts } from "@/constants/fonts";
import {
  ReceiptScanBusyOverlay,
  VoiceCaptureBar,
} from "@/features/transactions/components";
import { useAppStartupBootstrap } from "@/hooks/useAppStartupBootstrap";
import { queryPersister } from "@/lib/queryPersister";
import RootNavigator from "@/navigation/RootNavigator";
import { appNavigationTheme } from "@/navigation/theme";

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
});
WebBrowser.maybeCompleteAuthSession();
void SplashScreen.preventAutoHideAsync();

function AppShell() {
  const { cacheReady } = useAppStartupBootstrap();

  useEffect(() => {
    if (cacheReady) {
      void SplashScreen.hideAsync();
    }
  }, [cacheReady]);

  if (!cacheReady) {
    return null;
  }

  return (
    <>
      <NavigationContainer theme={appNavigationTheme}>
        <RootNavigator />
      </NavigationContainer>
      <ReceiptScanBusyOverlay />
      <VoiceCaptureBar />
      <ToastHost />
    </>
  );
}

export default function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error, query) => {
            console.error(
              `[QueryCache] fetch failed — key: ${JSON.stringify(query.queryKey)}`,
              error,
            );
          },
        }),
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            console.error(
              `[MutationCache] mutation failed — key: ${JSON.stringify(mutation.options.mutationKey ?? "unnamed")}`,
              error,
            );
          },
        }),
        defaultOptions: {
          queries: {
            // Data is considered fresh for 15 minutes — no refetch within that window,
            // even across app kills (MMKV persister restores the cache with original timestamps).
            staleTime: 15 * 60 * 1000,
            // Keep unused cache entries for 24 h so the persister can write them to MMKV.
            gcTime: 24 * 60 * 60 * 1000,
            retry: 1,
          },
        },
      }),
  );
  const [fontsLoaded, fontError] = useFonts(loadableAppFonts);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const applyAndroidNavBarStyle = async () => {
      await NavigationBar.setButtonStyleAsync("light");
    };

    void applyAndroidNavBarStyle();
  }, []);

  if (fontError) {
    useEffect(() => {
      void SplashScreen.hideAsync();
    }, []);
  }

  if (fontError) {
    console.error("[App] useFonts failed:", fontError);
    return (
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              padding: 24,
            }}
          >
            <Text style={{ fontSize: 16, textAlign: "center" }}>
              Could not load fonts. Close and reopen the app.
            </Text>
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (!fontsLoaded) {
    return null;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: 24 * 60 * 60 * 1000,
      }}
    >
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <KeyboardProvider>
            <AppShell />
          </KeyboardProvider>
          <StatusBar style="auto" />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </PersistQueryClientProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.pageBackground,
  },
});

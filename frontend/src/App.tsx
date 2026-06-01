import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { NavigationContainer } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import {
  ReceiptScanBusyOverlay,
  VoiceCaptureBar,
} from "@/features/transactions/components";
import { colors } from "@/constants";
import { loadableAppFonts } from "@/constants/fonts";
import { useCategoriesSyncBootstrap } from "@/hooks/useCategoriesSyncBootstrap";
import RootNavigator from "@/navigation/RootNavigator";
import { appNavigationTheme } from "@/navigation/theme";

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
});
WebBrowser.maybeCompleteAuthSession();
void SplashScreen.preventAutoHideAsync();

function AppShell() {
  useCategoriesSyncBootstrap();

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
        defaultOptions: {
          queries: {
            staleTime: 30_000,
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
      // Edge-to-edge mode blocks background/position APIs; only set button contrast.
      await NavigationBar.setButtonStyleAsync("light");
    };

    void applyAndroidNavBarStyle();
  }, []);

  useEffect(() => {
    if (!fontsLoaded && !fontError) {
      return;
    }
    void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

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
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <KeyboardProvider>
            <AppShell />
          </KeyboardProvider>
          <StatusBar style="auto" />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.pageBackground,
  },
});

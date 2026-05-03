import { NavigationContainer } from "@react-navigation/native";
import { useFonts } from "expo-font";
import * as NavigationBar from "expo-navigation-bar";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { loadableAppFonts } from "@/constants/fonts";
import RootNavigator from "@/navigation/RootNavigator";
import { appNavigationTheme } from "@/navigation/theme";

void SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded, fontError] = useFonts(loadableAppFonts);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }
    // Light nav surface + dark (gray) system icons — same pattern as Material edge-to-edge /
    // windowLightNavigationBar; matches a white bottom bar (see MainTabNavigator tab bar bg).
    NavigationBar.setStyle("light");
  }, []);

  useEffect(() => {
    if (!fontsLoaded && !fontError) {
      return;
    }
    void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <NavigationContainer theme={appNavigationTheme}>
          <RootNavigator />
        </NavigationContainer>
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

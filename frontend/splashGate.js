/**
 * Earliest startup — before App module graph. Prevents white root view flash on Android.
 */
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";

/** Must match splash background in app.json and `splashBackgroundColor`. */
const SPLASH_BACKGROUND = "#f9f9ff";

void SplashScreen.preventAutoHideAsync();
void SystemUI.setBackgroundColorAsync(SPLASH_BACKGROUND);

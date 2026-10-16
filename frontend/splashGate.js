/**
 * Earliest startup — before App module graph. Keeps the native splash up until the app hides it.
 *
 * The window behind the splash gets its colour from the activity theme (`activityBackground`, with a
 * dark variant in values-night), so nothing is painted from JS here. A JS repaint to the light colour
 * flashed white on a dark start, and would also turn the widget's transparent capture card opaque
 * (this file runs in that activity's process too; `preventAutoHideAsync` is harmless there because
 * only MainActivity registers the splash).
 */
import * as SplashScreen from "expo-splash-screen";

void SplashScreen.preventAutoHideAsync();

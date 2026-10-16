import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { useEffect, useState } from "react";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { loadableAppFonts } from "@/constants/fonts";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import { ThemeProvider } from "@/theme";

import { closeCard } from "../hooks/useCardClose";
import { useCardLaunch } from "../hooks/useCardLaunch";
import { PickedCaptureCard } from "./PickedCaptureCard";
import { QuickAddCard } from "./QuickAddCard";
import { SignedOutCard } from "./SignedOutCard";
import { VoiceCard } from "./VoiceCard";

function CardRouter() {
  const launch = useCardLaunch();
  const { userId } = useSessionUserId();
  const unknownLaunch = launch !== null && launch.mode === null;

  useEffect(() => {
    if (unknownLaunch) {
      closeCard();
    }
  }, [unknownLaunch]);

  if (!launch || !launch.mode) {
    return null;
  }
  if (!userId) {
    return <SignedOutCard key={launch.launchId} />;
  }
  switch (launch.mode) {
    case "add":
      return <QuickAddCard key={launch.launchId} userId={userId} />;
    case "scan":
      return <PickedCaptureCard key={launch.launchId} source="camera" userId={userId} trusted={launch.trusted} />;
    case "gallery":
      return <PickedCaptureCard key={launch.launchId} source="library" userId={userId} trusted={launch.trusted} />;
    case "voice":
      return <VoiceCard key={launch.launchId} userId={userId} trusted={launch.trusted} />;
  }
}

/**
 * The widget's capture card (`WidgetActionsActivity`, JS component "WidgetActions"). It shares the
 * JS runtime with the app but not its UI or side effects: only the providers the cards need, a
 * query client that is never persisted, and no navigation, notifications, realtime or snapshot writer.
 * The activity window is transparent, so nothing here paints a background.
 */
export default function WidgetActionsRoot() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );
  const [fontsLoaded, fontError] = useFonts(loadableAppFonts);

  return (
    <ThemeProvider manageSystemBars={false}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <KeyboardProvider>{fontsLoaded || fontError ? <CardRouter /> : null}</KeyboardProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

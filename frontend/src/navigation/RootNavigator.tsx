import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { useSplashReveal } from "@/components/app/SplashRevealContext";
import { colors } from "@/constants";
import { useCategoriesRealtimeSync } from "@/features/categories/hooks/useCategoriesRealtimeSync";
import { useCurrentUserProfileQuery } from "@/features/profile/hooks/useCurrentUserProfileQuery";
import { useNotificationsRealtimeSync } from "@/features/notifications/hooks/useNotificationsRealtimeSync";
import { useTransactionsRealtimeSync } from "@/features/transactions/hooks/useTransactionsRealtimeSync";
import AuthScreen from "@/screens/auth/AuthScreen";
import ProfileSetupScreen from "@/screens/onboarding/ProfileSetupScreen";
import WelcomeTourScreen from "@/screens/onboarding/WelcomeTourScreen";
import { useAuthSessionStore } from "@/stores/authSessionStore";
import { useCurrentUserStore } from "@/stores/currentUserStore";
import { useGoogleAuthGate } from "@/stores/googleAuthGate";
import { useWelcomeTourStore } from "@/stores/welcomeTourStore";

import MainStackNavigator from "./MainStackNavigator";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

const rootStackScreenOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: colors.pageBackground },
  animation: "fade" as const,
};

function hasEstablishedUsername(
  profile: { username?: string | null } | null | undefined,
): boolean {
  return Boolean(profile?.username?.trim());
}

type RootAppRoute =
  | "welcome"
  | "auth"
  | "bootstrapping"
  | "setup"
  | "main";

function resolveUnauthenticatedRoute(
  welcomeTourCompleted: boolean,
): "welcome" | "auth" {
  return welcomeTourCompleted ? "auth" : "welcome";
}

function resolveRootAppRoute(
  signedIn: boolean,
  profileGateReady: boolean,
  hasUsername: boolean,
  welcomeTourCompleted: boolean,
): RootAppRoute {
  if (!signedIn) {
    return resolveUnauthenticatedRoute(welcomeTourCompleted);
  }
  if (!profileGateReady) {
    return "bootstrapping";
  }
  if (!hasUsername) {
    return "setup";
  }
  return "main";
}

export default function RootNavigator() {
  const { setContentReady, markShellReady } = useSplashReveal();
  const profileUserId = useAuthSessionStore((s) => s.userId);
  const signedIn = profileUserId !== undefined;

  const googleAuthPending = useGoogleAuthGate((s) => s.isPending);
  const welcomeTourCompleted = useWelcomeTourStore((s) => s.completed);

  useCategoriesRealtimeSync(profileUserId ?? null);
  useTransactionsRealtimeSync(profileUserId ?? null);
  useNotificationsRealtimeSync(profileUserId ?? null);
  const cachedProfile = useCurrentUserStore((s) => s.profile);
  const meQuery = useCurrentUserProfileQuery(
    googleAuthPending ? undefined : profileUserId,
  );

  // A profile left on disk by another account must never decide this user's route.
  const ownCachedProfile =
    cachedProfile && cachedProfile.id === profileUserId ? cachedProfile : null;
  const resolvedProfile = meQuery.data ?? ownCachedProfile;
  const hasUsername = hasEstablishedUsername(resolvedProfile);

  const profileGateReady = !signedIn || meQuery.isFetched || hasUsername;
  const route = useMemo(
    () =>
      googleAuthPending
        ? "auth"
        : resolveRootAppRoute(
            signedIn,
            profileGateReady,
            hasUsername,
            welcomeTourCompleted,
          ),
    [
      googleAuthPending,
      hasUsername,
      profileGateReady,
      signedIn,
      welcomeTourCompleted,
    ],
  );

  useEffect(() => {
    setContentReady(route !== "bootstrapping");
  }, [route, setContentReady]);

  // Auth / onboarding screens have no shell to wait for; the main tabs mark it themselves.
  useEffect(() => {
    if (route !== "bootstrapping" && route !== "main") {
      markShellReady();
    }
  }, [route, markShellReady]);

  return (
    <View style={styles.root}>
      <Stack.Navigator screenOptions={rootStackScreenOptions}>
        {route === "welcome" ? (
          <Stack.Screen name="WelcomeTour" component={WelcomeTourScreen} />
        ) : route === "auth" || route === "bootstrapping" ? (
          <Stack.Screen name="Auth" component={AuthScreen} />
        ) : route === "setup" ? (
          <Stack.Screen
            name="ProfileSetup"
            component={ProfileSetupScreen}
            options={{ gestureEnabled: false }}
          />
        ) : (
          <Stack.Screen name="Main" component={MainStackNavigator} />
        )}
      </Stack.Navigator>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.pageBackground,
  },
});

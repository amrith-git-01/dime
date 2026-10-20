import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useEffect, useMemo } from "react";
import { ActivityIndicator, View } from "react-native";

import { useSplashReveal } from "@/components/app/SplashRevealContext";
import { useCategoriesRealtimeSync } from "@/features/categories/hooks/useCategoriesRealtimeSync";
import { useCurrentUserProfileQuery } from "@/features/profile/hooks/useCurrentUserProfileQuery";
import { useNotificationsRealtimeSync } from "@/features/notifications/hooks/useNotificationsRealtimeSync";
import { useTransactionsRealtimeSync } from "@/features/transactions/hooks/useTransactionsRealtimeSync";
import AuthScreen from "@/screens/auth/AuthScreen";
import ProfileSetupScreen from "@/screens/onboarding/ProfileSetupScreen";
import { useAuthSessionStore } from "@/stores/authSessionStore";
import { useCurrentUserStore } from "@/stores/currentUserStore";
import { useGoogleAuthGate } from "@/stores/googleAuthGate";

import MainStackNavigator from "./MainStackNavigator";
import type { RootStackParamList } from "./types";
import { resolveRootAppRoute, type ProfileKnowledge } from "./resolveRootAppRoute";
import { createThemedStyles, useTheme } from "@/theme";

const Stack = createNativeStackNavigator<RootStackParamList>();

const rootStackScreenOptions = {
  headerShown: false,
  animation: "fade" as const,
};

function hasEstablishedUsername(
  profile: { username?: string | null } | null | undefined,
): boolean {
  return Boolean(profile?.username?.trim());
}

/** Shown while the profile check runs: neutral, so a signed-in user never sees the sign-in screen. */
function BootstrapLoader() {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.loader} accessibilityLabel="Loading">
      <ActivityIndicator color={colors.inkFaint} />
    </View>
  );
}

export default function RootNavigator() {
  const styles = useStyles();
  const { setContentReady, markShellReady } = useSplashReveal();
  const profileUserId = useAuthSessionStore((s) => s.userId);
  const signedIn = profileUserId !== undefined;

  const googleAuthPending = useGoogleAuthGate((s) => s.isPending);

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
  const profile: ProfileKnowledge = !resolvedProfile
    ? "unknown"
    : hasEstablishedUsername(resolvedProfile)
      ? "has-username"
      : "no-username";
  const me = meQuery.isError ? "failed" : meQuery.isFetched ? "success" : "pending";

  const route = useMemo(
    () =>
      googleAuthPending
        ? "auth"
        : resolveRootAppRoute({ signedIn, profile, me }),
    [googleAuthPending, me, profile, signedIn],
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
        {route === "bootstrapping" ? (
          <Stack.Screen name="Bootstrapping" component={BootstrapLoader} />
        ) : route === "auth" ? (
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

const useStyles = createThemedStyles(({ colors }) => ({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
  },
}));

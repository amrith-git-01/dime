import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useSplashReveal } from "@/components/app/SplashRevealContext";
import { colors } from "@/constants";
import { useCategoriesRealtimeSync } from "@/features/categories/hooks/useCategoriesRealtimeSync";
import { useCurrentUserProfileQuery } from "@/features/profile/hooks/useCurrentUserProfileQuery";
import { useTransactionsRealtimeSync } from "@/features/transactions/hooks/useTransactionsRealtimeSync";
import { supabase } from "@/lib/supabase/client";
import { readStoredAuthSession } from "@/lib/supabase/mmkvAuthStorage";
import AuthScreen from "@/screens/auth/AuthScreen";
import ProfileSetupScreen from "@/screens/onboarding/ProfileSetupScreen";
import WelcomeTourScreen from "@/screens/onboarding/WelcomeTourScreen";
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

type RootAppRoute = "welcome" | "auth" | "bootstrapping" | "setup" | "main";

function resolveUnauthenticatedRoute(
  welcomeTourCompleted: boolean,
): "welcome" | "auth" {
  return welcomeTourCompleted ? "auth" : "welcome";
}

function resolveRootAppRoute(
  session: Session | null,
  profileGateReady: boolean,
  hasUsername: boolean,
  welcomeTourCompleted: boolean,
): RootAppRoute {
  if (!session) {
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
  const { setContentReady } = useSplashReveal();
  const [session, setSession] = useState<Session | null>(() =>
    readStoredAuthSession(),
  );

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session: initial } }) => {
      setSession(initial);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const googleAuthPending = useGoogleAuthGate((s) => s.isPending);
  const welcomeTourCompleted = useWelcomeTourStore((s) => s.completed);
  const profileUserId = session?.user.id;

  useCategoriesRealtimeSync(profileUserId ?? null);
  useTransactionsRealtimeSync(profileUserId ?? null);
  const cachedProfile = useCurrentUserStore((s) => s.profile);
  const meQuery = useCurrentUserProfileQuery(
    googleAuthPending ? undefined : profileUserId,
  );

  const resolvedProfile = meQuery.data ?? cachedProfile;
  const hasUsername = hasEstablishedUsername(resolvedProfile);

  const profileGateReady = !session || meQuery.isFetched || hasUsername;

  const route = useMemo(
    () =>
      googleAuthPending
        ? "auth"
        : resolveRootAppRoute(
            session,
            profileGateReady,
            hasUsername,
            welcomeTourCompleted,
          ),
    [
      googleAuthPending,
      session,
      profileGateReady,
      hasUsername,
      welcomeTourCompleted,
    ],
  );

  useEffect(() => {
    setContentReady(route !== "bootstrapping");
  }, [route, setContentReady]);

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

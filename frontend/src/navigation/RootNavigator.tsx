import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { SplashBrandedShell } from "@/components/app/SplashBrandedShell";
import { useSplashReveal } from "@/components/app/SplashRevealContext";
import { colors } from "@/constants";
import { splashBackgroundColor } from "@/constants/splash";
import { useCategoriesRealtimeSync } from "@/features/categories/hooks/useCategoriesRealtimeSync";
import { useCurrentUserProfileQuery } from "@/features/profile/hooks/useCurrentUserProfileQuery";
import { useTransactionsRealtimeSync } from "@/features/transactions/hooks/useTransactionsRealtimeSync";
import { supabase } from "@/lib/supabase/client";
import { readStoredAuthSession } from "@/lib/supabase/mmkvAuthStorage";
import AuthScreen from "@/screens/auth/AuthScreen";
import ProfileSetupScreen from "@/screens/onboarding/ProfileSetupScreen";
import { useCurrentUserStore } from "@/stores/currentUserStore";

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

/** Stack placeholder while `/me` resolves — splash overlay covers this. */
function ResolvingStackPlaceholder() {
  return <View style={styles.resolvingPlaceholder} />;
}

export default function RootNavigator() {
  const { setContentReady } = useSplashReveal();
  const [session, setSession] = useState<Session | null>(() =>
    readStoredAuthSession(),
  );
  const justLoggedInRef = useRef(false);
  const authBootstrappedRef = useRef(false);
  const previousSessionRef = useRef<Session | null>(null);

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

  useEffect(() => {
    if (!authBootstrappedRef.current) {
      authBootstrappedRef.current = true;
      previousSessionRef.current = session;
      return;
    }

    if (previousSessionRef.current === null && session !== null) {
      justLoggedInRef.current = true;
    }

    if (session === null) {
      justLoggedInRef.current = false;
    }

    previousSessionRef.current = session;
  }, [session]);

  const profileUserId = session?.user.id;
  useCategoriesRealtimeSync(profileUserId ?? null);
  useTransactionsRealtimeSync(profileUserId ?? null);
  const cachedProfile = useCurrentUserStore((s) => s.profile);
  const meQuery = useCurrentUserProfileQuery(profileUserId);

  const resolvedProfile = meQuery.data ?? cachedProfile;
  const hasUsername = hasEstablishedUsername(resolvedProfile);

  const { profileGateReady, needsProfileSetup } = useMemo(() => {
    if (!session) {
      return { profileGateReady: true, needsProfileSetup: false };
    }

    const gateReady = meQuery.isFetched || hasUsername;
    const needsSetup = gateReady && !hasUsername;

    return { profileGateReady: gateReady, needsProfileSetup: needsSetup };
  }, [session, meQuery.isFetched, hasUsername]);

  useEffect(() => {
    if (profileGateReady) {
      justLoggedInRef.current = false;
    }
  }, [profileGateReady]);

  const resolvingProfile = Boolean(session && !profileGateReady);
  const resolvingAfterLogin = resolvingProfile && justLoggedInRef.current;
  const showAuth = !session || resolvingAfterLogin;

  useEffect(() => {
    const ready = !session || profileGateReady;
    setContentReady(ready && !resolvingAfterLogin);
  }, [session, profileGateReady, resolvingAfterLogin, setContentReady]);

  return (
    <View style={styles.root}>
      <Stack.Navigator screenOptions={rootStackScreenOptions}>
        {showAuth ? (
          <Stack.Screen name="Auth" component={AuthScreen} />
        ) : resolvingProfile ? (
          <Stack.Screen
            name="SessionResolving"
            component={ResolvingStackPlaceholder}
          />
        ) : needsProfileSetup ? (
          <Stack.Screen
            name="ProfileSetup"
            component={ProfileSetupScreen}
            options={{ gestureEnabled: false }}
          />
        ) : (
          <Stack.Screen name="Main" component={MainStackNavigator} />
        )}
      </Stack.Navigator>

      {resolvingProfile ? (
        <View
          style={styles.resolvingOverlay}
          accessibilityLabel="Loading"
          pointerEvents="auto"
        >
          <SplashBrandedShell />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.pageBackground,
  },
  resolvingPlaceholder: {
    flex: 1,
    backgroundColor: splashBackgroundColor,
  },
  resolvingOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
});

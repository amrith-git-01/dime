import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { colors } from "@/constants";
import { useCurrentUserProfileQuery } from "@/features/profile/hooks/useCurrentUserProfileQuery";
import { useTransactionsRealtimeSync } from "@/features/transactions/hooks/useTransactionsRealtimeSync";
import { supabase } from "@/lib/supabase/client";
import AuthScreen from "@/screens/auth/AuthScreen";
import ProfileSetupScreen from "@/screens/onboarding/ProfileSetupScreen";
import SessionResolvingScreen from "@/screens/onboarding/SessionResolvingScreen";
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

export default function RootNavigator() {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const justLoggedInRef = useRef(false);
  const authBootstrappedRef = useRef(false);
  const previousSessionRef = useRef<Session | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session: initial } }) => {
      setSession(initial);
      setSessionReady(true);
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
    if (!sessionReady) {
      return;
    }

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
  }, [session, sessionReady]);

  const profileUserId = session?.user.id;
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
  const showResolvingScreen = resolvingProfile && !justLoggedInRef.current;
  const initialBoot = !sessionReady;

  if (initialBoot) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Navigator screenOptions={rootStackScreenOptions}>
        {showAuth ? (
          <Stack.Screen name="Auth" component={AuthScreen} />
        ) : showResolvingScreen ? (
          <Stack.Screen
            name="SessionResolving"
            component={SessionResolvingScreen}
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

      {resolvingAfterLogin ? (
        <View style={styles.resolvingOverlay} accessibilityLabel="Signing in">
          <ActivityIndicator size="large" color={colors.primary} />
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
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.pageBackground,
  },
  resolvingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.pageBackground,
  },
});

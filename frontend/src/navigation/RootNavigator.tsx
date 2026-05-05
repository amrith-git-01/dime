import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { colors } from "@/constants/theme";
import { useCurrentUserProfileQuery } from "@/features/profile/hooks/useCurrentUserProfileQuery";
import { supabase } from "@/lib/supabase/client";
import AuthScreen from "@/screens/auth/AuthScreen";
import ProfileSetupScreen from "@/screens/onboarding/ProfileSetupScreen";

import MainTabNavigator from "./MainTabNavigator";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [profileGateReady, setProfileGateReady] = useState(false);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);

  const handleProfileComplete = useCallback(() => {
    setNeedsProfileSetup(false);
  }, []);

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

  const profileUserId = session?.user.id;
  const meQuery = useCurrentUserProfileQuery(profileUserId);

  useEffect(() => {
    if (!session) {
      setProfileGateReady(true);
      setNeedsProfileSetup(false);
      return;
    }

    if (meQuery.isLoading) {
      setProfileGateReady(false);
      return;
    }

    if (meQuery.isError) {
      setNeedsProfileSetup(true);
      setProfileGateReady(true);
      return;
    }

    const row = meQuery.data;
    if (!row || row.username == null) {
      setNeedsProfileSetup(true);
    } else {
      setNeedsProfileSetup(false);
    }
    setProfileGateReady(true);
  }, [session, meQuery.isLoading, meQuery.isError, meQuery.data]);

  const booting = !sessionReady || (session !== null && !profileGateReady);

  if (booting) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!session ? (
        <Stack.Screen name="Auth" component={AuthScreen} />
      ) : needsProfileSetup ? (
        <Stack.Screen name="ProfileSetup">
          {() => (
            <ProfileSetupScreen onProfileComplete={handleProfileComplete} />
          )}
        </Stack.Screen>
      ) : (
        <Stack.Screen name="Main" component={MainTabNavigator} />
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.pageBackground,
  },
});

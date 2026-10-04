import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { useSplashReveal } from "@/components/app/SplashRevealContext";
import { colors } from "@/constants";
import { useCategoriesRealtimeSync } from "@/features/categories/hooks/useCategoriesRealtimeSync";
import { useCurrentUserProfileQuery } from "@/features/profile/hooks/useCurrentUserProfileQuery";
import { useTransactionsRealtimeSync } from "@/features/transactions/hooks/useTransactionsRealtimeSync";
import { shouldHoldSmsReviewRoute } from "@/features/transactions/sms/smsGate";
import { useSmsInboxOpenGate } from "@/features/transactions/sms/useSmsInboxOpenGate";
import AuthScreen from "@/screens/auth/AuthScreen";
import ProfileSetupScreen from "@/screens/onboarding/ProfileSetupScreen";
import WelcomeTourScreen from "@/screens/onboarding/WelcomeTourScreen";
import SmsInboxReviewScreen from "@/screens/transactions/SmsInboxReviewScreen";
import { useAuthSessionStore } from "@/stores/authSessionStore";
import { useCapturePreferencesStore } from "@/stores/capturePreferencesStore";
import { useCurrentUserStore } from "@/stores/currentUserStore";
import { useGoogleAuthGate } from "@/stores/googleAuthGate";
import { useSmsInboxReviewStore } from "@/stores/smsInboxReviewStore";
import { useWelcomeTourStore } from "@/stores/welcomeTourStore";

import MainStackNavigator from "./MainStackNavigator";
import { stackScreenOptions } from "./stackScreenOptions";
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
  | "sms-review"
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
  holdSmsReview: boolean,
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
  if (holdSmsReview) {
    return "sms-review";
  }
  return "main";
}

export default function RootNavigator() {
  const { setContentReady } = useSplashReveal();
  const profileUserId = useAuthSessionStore((s) => s.userId);
  const signedIn = profileUserId !== undefined;

  const googleAuthPending = useGoogleAuthGate((s) => s.isPending);
  const welcomeTourCompleted = useWelcomeTourStore((s) => s.completed);
  const smsScanEnabled = useCapturePreferencesStore((s) => s.smsScanEnabled);
  const smsPhase = useSmsInboxReviewStore((s) => s.phase);

  useCategoriesRealtimeSync(profileUserId ?? null);
  useTransactionsRealtimeSync(profileUserId ?? null);
  const cachedProfile = useCurrentUserStore((s) => s.profile);
  const meQuery = useCurrentUserProfileQuery(
    googleAuthPending ? undefined : profileUserId,
  );

  const resolvedProfile = meQuery.data ?? cachedProfile;
  const hasUsername = hasEstablishedUsername(resolvedProfile);

  const profileGateReady = !signedIn || meQuery.isFetched || hasUsername;
  const authedMain = Boolean(
    signedIn && hasUsername && !googleAuthPending && profileGateReady,
  );
  useSmsInboxOpenGate({
    userId: profileUserId ?? null,
    mainActive: authedMain,
  });
  const holdSmsReview =
    authedMain && shouldHoldSmsReviewRoute(smsScanEnabled, smsPhase);
  const smsScanPending =
    authedMain &&
    smsScanEnabled &&
    (smsPhase === "idle" || smsPhase === "scanning");

  const route = useMemo(
    () =>
      googleAuthPending
        ? "auth"
        : resolveRootAppRoute(
            signedIn,
            profileGateReady,
            hasUsername,
            welcomeTourCompleted,
            holdSmsReview,
          ),
    [
      googleAuthPending,
      hasUsername,
      holdSmsReview,
      profileGateReady,
      signedIn,
      welcomeTourCompleted,
    ],
  );

  useEffect(() => {
    setContentReady(route !== "bootstrapping" && !smsScanPending);
  }, [route, setContentReady, smsScanPending]);

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
        ) : route === "sms-review" ? (
          <Stack.Screen
            name="SmsInboxReview"
            component={SmsInboxReviewScreen}
            options={{
              ...stackScreenOptions,
              title: "Bank messages",
              gestureEnabled: false,
            }}
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

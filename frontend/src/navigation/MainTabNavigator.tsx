import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSplashReveal } from "@/components/app/SplashRevealContext";
import { AppHeader } from "@/components/layout/AppHeader";
import { OfflineBanner } from "@/components/layout/OfflineBanner";
import { DimeTabBar } from "@/components/navigation/DimeTabBar";
import { spacing } from "@/constants";
import { AgentChatOverlay } from "@/features/agent/components";
import {
  launchTour,
  tourIdForTab,
  useFocusedTourTab,
} from "@/features/appTour";
import { useAppTourAutoStart } from "@/features/appTour/hooks/useAppTourAutoStart";
import { notifyTourTabFocused } from "@/features/appTour/hooks/useTourPaused";
import { useLimitsQuery } from "@/features/limits/hooks/useLimitsQuery";
import { getCaptureAvailability } from "@/features/limits/utils/limitsFormat";
import { useUnreadNotificationCount } from "@/features/notifications/hooks/useUnreadNotificationCount";
import { useToast } from "@/features/toast/useToast";
import { useReceiptCameraTransaction } from "@/features/transactions/hooks/useReceiptCameraTransaction";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import AnalyticsScreen from "@/screens/analytics/AnalyticsScreen";
import BudgetScreen from "@/screens/budget/BudgetScreen";
import HomeScreen from "@/screens/home/HomeScreen";
import TransactionsScreen from "@/screens/transactions/TransactionsScreen";
import { usePendingDeepLinkStore } from "@/stores/pendingDeepLinkStore";
import type { MainStackParamList, MainTabParamList } from "./types";
import { createThemedStyles, useTheme } from "@/theme";

const Tabs = createBottomTabNavigator<MainTabParamList>();

export default function MainTabNavigator() {
  const { colors } = useTheme();
  const styles = useStyles();
  const safeInsets = useSafeAreaInsets();
  const stackNavigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const [headerReady, setHeaderReady] = useState(false);
  const [tabBarReady, setTabBarReady] = useState(false);
  const tabBarReservedHeight =
    spacing.tabBarHeight + Math.max(safeInsets.bottom, spacing.sm);
  const shellReady = useMemo(
    () => headerReady && tabBarReady,
    [headerReady, tabBarReady],
  );
  // The splash overlay owns the first reveal: it stays up until this shell reports ready.
  // `splashShellReady` is already true only on a later remount (e.g. after signing in), when
  // the splash is gone and the loader below covers the layout pass instead.
  const {
    shellReady: splashShellReady,
    splashRevealed,
    markShellReady,
  } = useSplashReveal();
  useEffect(() => {
    if (shellReady) {
      markShellReady();
    }
  }, [shellReady, markShellReady]);
  const onNotificationsPress = useCallback(() => {
    void triggerHaptic();
    stackNavigation.navigate("Notifications");
  }, [stackNavigation]);
  const onSettingsPress = useCallback(() => {
    void triggerHaptic();
    stackNavigation.navigate("Settings");
  }, [stackNavigation]);
  // The header's "?" opens the guided tour of whichever tab is on screen.
  const focusedTab = useFocusedTourTab();
  const onHelpPress = useCallback(() => {
    void triggerHaptic();
    if (focusedTab) {
      launchTour(tourIdForTab(focusedTab));
    }
  }, [focusedTab]);

  const onManualAddPress = useCallback(() => {
    stackNavigation.navigate("ManualAddTransaction");
  }, [stackNavigation]);
  const captureReceiptAndCreate = useReceiptCameraTransaction();
  const onCaptureReceiptPress = useCallback(() => {
    void captureReceiptAndCreate();
  }, [captureReceiptAndCreate]);
  const { showToast } = useToast();
  const { data: limits, isLoading: limitsLoading } = useLimitsQuery();
  const receiptOption = useMemo(() => {
    const a = getCaptureAvailability("receipt", limits);
    return { ...a, blockedMessage: a.message };
  }, [limits]);
  const voiceOption = useMemo(() => {
    const a = getCaptureAvailability("voice", limits);
    return { ...a, blockedMessage: a.message };
  }, [limits]);
  const onBlockedOptionPress = useCallback(
    (message: string) => showToast({ variant: "info", message }),
    [showToast],
  );
  // `dime://scan` (home-screen widget): open the receipt camera unless today's scans are used up.
  const scanRequested = usePendingDeepLinkStore((s) => s.scanRequested);
  useEffect(() => {
    // Wait for today's limits (while they load) so a used-up scan limit shows its toast, not the camera.
    if (!scanRequested || limitsLoading) {
      return;
    }
    usePendingDeepLinkStore.getState().consumeScan();
    if (receiptOption.blocked) {
      if (receiptOption.blockedMessage) {
        onBlockedOptionPress(receiptOption.blockedMessage);
      }
      return;
    }
    onCaptureReceiptPress();
  }, [
    scanRequested,
    limitsLoading,
    receiptOption,
    onBlockedOptionPress,
    onCaptureReceiptPress,
  ]);
  useAppTourAutoStart({ shellReady, splashRevealed });
  const unreadQuery = useUnreadNotificationCount();
  const showUnreadNotificationDot = (unreadQuery.data ?? 0) > 0;

  return (
    <View style={styles.root}>
      <View style={styles.headerSlot}>
        <AppHeader
          onNotificationsPress={onNotificationsPress}
          onSettingsPress={onSettingsPress}
          onHelpPress={onHelpPress}
          onHeaderReady={() => setHeaderReady(true)}
          showUnreadNotificationDot={showUnreadNotificationDot}
        />
      </View>
      <OfflineBanner />
      <View style={styles.navigatorSlot}>
        <Tabs.Navigator
          tabBar={(props) => (
            <DimeTabBar
              {...props}
              onFirstLayout={() => setTabBarReady(true)}
              onManualAddPress={onManualAddPress}
              onCaptureReceiptPress={onCaptureReceiptPress}
              receiptOption={receiptOption}
              voiceOption={voiceOption}
              onBlockedOptionPress={onBlockedOptionPress}
            />
          )}
          screenListeners={{
            tabPress: () => {
              void triggerHaptic();
            },
            // Also fires for the first tab on mount, which the tour's route tracking otherwise misses.
            focus: notifyTourTabFocused,
          }}
          screenOptions={{
            headerShown: false,
            tabBarShowLabel: false,
            /** Matches DimeTabBar so scene layout reserves correct space before first layout. */
            tabBarStyle: { height: tabBarReservedHeight },
          }}
        >
          <Tabs.Screen
            name="Home"
            component={HomeScreen}
            options={{
              title: "Home",
            }}
          />
          <Tabs.Screen
            name="Transactions"
            component={TransactionsScreen}
            options={{
              title: "Transactions",
            }}
          />
          <Tabs.Screen
            name="Budgets"
            component={BudgetScreen}
            options={{
              title: "Budgets",
            }}
          />
          <Tabs.Screen
            name="Insights"
            component={AnalyticsScreen}
            options={{
              title: "Insights",
            }}
          />
        </Tabs.Navigator>
        {!shellReady && splashShellReady ? (
          <View style={styles.shellLoaderOverlay}>
            <ActivityIndicator color={colors.accentText} />
          </View>
        ) : null}
      </View>
      <AgentChatOverlay showEntryFab={shellReady} />
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  headerSlot: {
    flexShrink: 0,
    zIndex: 2,
    elevation: 4,
  },
  navigatorSlot: {
    flex: 1,
    minHeight: 0,
  },
  shellLoaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
}));

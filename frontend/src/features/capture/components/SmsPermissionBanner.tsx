import { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { useSmsPermission } from "@/features/capture/hooks/useSmsPermission";
import { useCapturePreferencesStore } from "@/stores/capturePreferencesStore";

type SmsPermissionBannerProps = {
  visible: boolean;
};

export const SmsPermissionBanner = memo(function SmsPermissionBanner({
  visible,
}: SmsPermissionBannerProps) {
  const insets = useSafeAreaInsets();
  const smsEnabled = useCapturePreferencesStore((s) => s.smsEnabled);
  const { granted, checking, request, openSettings, isAndroid } =
    useSmsPermission();

  const handlePress = useCallback(() => {
    void request().then((allowed) => {
      if (!allowed) {
        openSettings();
      }
    });
  }, [openSettings, request]);

  if (!visible || !isAndroid || !smsEnabled || granted) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { bottom: insets.bottom + spacing.md }]}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Enable bank SMS capture</Text>
        <Text style={styles.body}>
          Allow SMS access so Dime can detect debit and credit alerts
          automatically.
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={checking}
          onPress={handlePress}
          style={({ pressed }) => [
            styles.button,
            pressed ? styles.buttonPressed : null,
          ]}
        >
          <Text style={styles.buttonLabel}>
            {checking ? "Checking…" : "Allow SMS access"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
  },
  card: {
    backgroundColor: colors.barBackground,
    borderRadius: 16,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  title: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  body: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  button: {
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginTop: spacing.xs,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    lineHeight: 18,
    color: colors.textOnPrimary,
  },
});

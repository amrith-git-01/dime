import { memo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import {
  BENTO_FORM_BODY_GAP,
  BENTO_FORM_SECTION_PADDING,
} from "@/components/bento";
import { TwoToneCard } from "@/components/shared";
import { Button } from "@/components/ui";
import { bento, colors, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import { APP_PERMISSION_ITEMS } from "../constants/appPermissionItems";
import type { AppPermissionState } from "../utils/appPermissions";
import { PermissionSetupRow } from "./PermissionSetupRow";

export type PermissionsSetupEditorProps = {
  permissionStates: AppPermissionState[];
  requestingId: string | null;
  continuing: boolean;
  onRequestPermission: (id: AppPermissionState["id"]) => void;
  onContinue: () => void;
};

export const PermissionsSetupEditor = memo(function PermissionsSetupEditor({
  permissionStates,
  requestingId,
  continuing,
  onRequestPermission,
  onContinue,
}: PermissionsSetupEditorProps) {
  const stateById = new Map(permissionStates.map((item) => [item.id, item]));
  const visibleItems = APP_PERMISSION_ITEMS.filter(
    (item) => !item.androidOnly || Platform.OS === "android",
  );

  return (
    <View style={styles.root}>
      <TwoToneCard
        header={
          <View style={styles.headerInner}>
            <Text style={styles.kicker}>Permissions</Text>
            <Text style={styles.title}>Set up Dime on this device</Text>
            <Text style={styles.subtitle}>
              Allow the features you want now. You can change these anytime in
              Android settings or Dime settings.
            </Text>
          </View>
        }
        body={
          <View style={styles.bodyInner}>
            {visibleItems.map((item, index) => {
              const state = stateById.get(item.id);
              return (
                <PermissionSetupRow
                  key={item.id}
                  id={item.id}
                  title={item.title}
                  description={item.description}
                  granted={state?.granted ?? false}
                  unavailable={state?.available === false}
                  requesting={requestingId === item.id}
                  onRequest={() => onRequestPermission(item.id)}
                  showSeparator={index < visibleItems.length - 1}
                />
              );
            })}
          </View>
        }
      />

      <Button
        title="Continue to Home"
        loading={continuing}
        onPress={onContinue}
      />
      <Text style={styles.footerHint}>
        Skipping is fine — Dime still works with manual entry, voice, and
        receipts when you allow them later.
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    gap: spacing.lg,
  },
  headerInner: {
    padding: BENTO_FORM_SECTION_PADDING,
    gap: BENTO_FORM_BODY_GAP / 2,
  },
  kicker: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: bento.onPastel.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  title: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 22,
    lineHeight: 28,
    color: bento.onPastel.primary,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: bento.onPastel.muted,
  },
  bodyInner: {
    paddingHorizontal: BENTO_FORM_SECTION_PADDING,
    paddingBottom: BENTO_FORM_SECTION_PADDING,
  },
  footerHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: spacing.sm,
  },
});

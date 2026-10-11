import { memo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  fontFamilies,
  ink,
  inkSoft,
  radius,
  shadows,
  surface,
} from "@/constants";

import {
  SETTINGS_CARD_PADDING,
  SETTINGS_FORM_GAP,
} from "../constants/settingsTokens";

type SettingsFormCardProps = {
  title?: string;
  subtitle?: string;
  /** Custom header block (e.g. account avatar). Replaces title/subtitle when set. */
  header?: ReactNode;
  children: ReactNode;
};

export const SettingsFormCard = memo(function SettingsFormCard({
  title,
  subtitle,
  header,
  children,
}: SettingsFormCardProps) {
  const showTextHeader = !header && (title ?? subtitle);
  const hasHeader = Boolean(header || showTextHeader);

  return (
    <View style={[styles.card, shadows.card]}>
      {header ? (
        <View style={styles.header}>{header}</View>
      ) : showTextHeader ? (
        <View style={styles.header}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      ) : null}
      <View style={[styles.body, !hasHeader && styles.bodyStandalone]}>
        {children}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: surface,
    borderRadius: radius.lg,
    overflow: "visible",
  },
  header: {
    padding: SETTINGS_CARD_PADDING,
    paddingBottom: SETTINGS_FORM_GAP / 2,
    gap: SETTINGS_FORM_GAP / 2,
  },
  title: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: ink,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: inkSoft,
  },
  body: {
    padding: SETTINGS_CARD_PADDING,
    paddingTop: 0,
    gap: SETTINGS_FORM_GAP,
  },
  bodyStandalone: {
    paddingTop: SETTINGS_CARD_PADDING,
  },
});

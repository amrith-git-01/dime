import { memo, type ReactNode } from "react";
import { Text, View } from "react-native";

import { fontFamilies, radius } from "@/constants";

import {
  SETTINGS_CARD_PADDING,
  SETTINGS_FORM_GAP,
} from "../constants/settingsTokens";
import { createThemedStyles, useTheme } from "@/theme";

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
  const { shadows } = useTheme();
  const styles = useStyles();
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

const useStyles = createThemedStyles(({ colors }) => ({
  card: {
    backgroundColor: colors.surface,
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
    color: colors.ink,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  body: {
    padding: SETTINGS_CARD_PADDING,
    paddingTop: 0,
    gap: SETTINGS_FORM_GAP,
  },
  bodyStandalone: {
    paddingTop: SETTINGS_CARD_PADDING,
  },
}));

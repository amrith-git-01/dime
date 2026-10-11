import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native";

import { spacing } from "@/constants";

const BUSY_LABEL_OVERRIDES: Record<string, string> = {
  "sign in": "Signing in",
  "sign out": "Signing out",
  "log out": "Logging out",
  retry: "Retrying",
  refresh: "Refreshing",
  submit: "Submitting",
};

/** "Save" -> "Saving", "Delete category" -> "Deleting category", "Continue with Google" -> "Continuing". */
export function toBusyLabel(title: string): string {
  const trimmed = title.trim();
  const lower = trimmed.toLowerCase();
  for (const [key, value] of Object.entries(BUSY_LABEL_OVERRIDES)) {
    if (lower === key || lower.startsWith(`${key} `)) {
      return `${value}${trimmed.slice(key.length)}`;
    }
  }
  const [first = "", ...rest] = trimmed.split(" ");
  if (!first || /ing$/i.test(first)) {
    return trimmed;
  }
  const stem = /[^aeiou]e$/i.test(first) ? first.slice(0, -1) : first;
  const suffix = rest.join(" ");
  const withWith = /^with$/i.test(rest[0] ?? "") ? "" : suffix;
  return `${stem}ing${withWith ? ` ${withWith}` : ""}`;
}


type ButtonBusyContentProps = {
  loading: boolean;
  label: string;
  /** Continuous-tense label while busy. Derived from `label` when omitted. */
  busyLabel?: string;
  /** Label and spinner color. */
  color: string;
  textStyle?: StyleProp<TextStyle>;
};

/**
 * Standard button content: idle shows the label; busy shows a small spinner on the left
 * of the continuous-tense label ("Saving"). Every button in the app renders through this.
 */
export function ButtonBusyContent({
  loading,
  label,
  busyLabel,
  color,
  textStyle,
}: ButtonBusyContentProps) {
  return (
    <View style={styles.content}>
      {loading ? <ActivityIndicator size="small" color={color} /> : null}
      <Text style={[textStyle, { color }]}>
        {loading ? (busyLabel ?? toBusyLabel(label)) : label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
});

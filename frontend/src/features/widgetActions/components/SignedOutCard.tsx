import { Linking, Text, View } from "react-native";

import { Button } from "@/components/ui";
import { fontFamilies, spacing } from "@/constants";
import { deepLinkUrls } from "@/lib/deepLinks/deepLinkUrls";
import { reportError } from "@/lib/reportError";
import { createThemedStyles } from "@/theme";

import { closeCard } from "../hooks/useCardClose";
import { CardFrame } from "./CardFrame";

/** Nobody is signed in: the widget's buttons cannot do anything yet, so offer the app. */
export function SignedOutCard() {
  const styles = useStyles();

  const openDime = () => {
    Linking.openURL(deepLinkUrls.home)
      .catch((error) => reportError(error, "widget card could not open Dime"))
      .finally(closeCard);
  };

  return (
    <CardFrame variant="sheet" onBackdropPress={closeCard}>
      <View style={styles.body}>
        <Text style={styles.title}>Sign in to Dime</Text>
        <Text style={styles.message}>Open Dime and sign in to add expenses from your home screen.</Text>
        <Button title="Open Dime" onPress={openDime} />
      </View>
    </CardFrame>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  body: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.ink,
  },
  message: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
}));

import { useState } from "react";
import { Text } from "react-native";

import { Button } from "@/components/ui";
import { fontFamilies } from "@/constants";
import { createThemedStyles } from "@/theme";

import { closeCard } from "../hooks/useCardClose";
import { usePickedCapture, type PickSource } from "../hooks/usePickedCapture";
import { CapturePill } from "./CapturePill";
import { CardFrame } from "./CardFrame";

const CONFIRM_TEXT: Record<PickSource, string> = {
  camera: "Scan a receipt?",
  library: "Pick a receipt?",
};

type PickedCaptureCardProps = {
  source: PickSource;
  userId: string;
  /** The link carried our token. Otherwise the user confirms before the camera or picker opens. */
  trusted: boolean;
};

/**
 * Scan and Gallery: nothing is drawn while the camera or the photo picker is up (the card is
 * behind it); once a photo is picked the pill shows sending, reading and the result.
 */
export function PickedCaptureCard({ source, userId, trusted }: PickedCaptureCardProps) {
  const styles = useStyles();
  const [confirmed, setConfirmed] = useState(trusted);
  const capture = usePickedCapture(source, userId, confirmed);

  if (!confirmed) {
    return (
      <CardFrame variant="pill" onBackdropPress={closeCard}>
        <Text style={styles.question}>{CONFIRM_TEXT[source]}</Text>
        <Button title="Continue" size="compact" onPress={() => setConfirmed(true)} />
        <Button title="Cancel" variant="ghost" size="compact" onPress={closeCard} />
      </CardFrame>
    );
  }
  if (capture.phase === "launching") {
    return null;
  }
  return (
    <CardFrame variant="pill" onBackdropPress={closeCard}>
      <CapturePill
        phase={capture.phase}
        text={capture.text}
        onRetry={capture.retry}
        onClose={closeCard}
      />
    </CardFrame>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  question: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
}));

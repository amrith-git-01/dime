import { X } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/shared";
import { SkeletonBlock } from "@/components/ui";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { createThemedStyles, useTheme } from "@/theme";

export type ReportStatus = "loading" | "missing" | "offline" | "error";

type ReportStatusViewProps = {
  status: ReportStatus;
  onRetry: () => void;
  onClose: () => void;
};

const CLOSE_HIT = 44;

const COPY: Record<
  Exclude<ReportStatus, "loading">,
  { headline: string; subtext: string; retry: boolean }
> = {
  missing: {
    headline: "This report isn't available",
    subtext:
      "It may not be ready yet, or that month had fewer than 5 payments. Reports are built on the 1st.",
    retry: false,
  },
  offline: {
    headline: "You're offline",
    subtext: "Connect to the internet to open this report.",
    retry: true,
  },
  error: {
    headline: "Couldn't load this report",
    subtext: "Something went wrong on our side. Try again in a moment.",
    retry: true,
  },
};

/** What the report route shows before there is a story: skeleton, "not available", offline, error. */
export function ReportStatusView({ status, onRetry, onClose }: ReportStatusViewProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const copy = status === "loading" ? null : COPY[status];

  return (
    <View style={styles.root}>
      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close report"
          hitSlop={8}
          onPress={() => {
            void triggerHaptic();
            onClose();
          }}
          style={styles.close}
        >
          <X size={24} color={colors.ink} strokeWidth={2.25} />
        </Pressable>
      </View>

      {copy ? (
        <View style={styles.center}>
          <EmptyState
            layout="card"
            headline={copy.headline}
            subtext={copy.subtext}
            actionLabel={copy.retry ? "Retry" : "Close"}
            onAction={copy.retry ? onRetry : onClose}
            secondaryActionLabel={copy.retry ? "Close" : undefined}
            onSecondaryAction={copy.retry ? onClose : undefined}
          />
        </View>
      ) : (
        <View
          style={styles.center}
          accessibilityRole="progressbar"
          accessibilityLabel="Loading your report"
        >
          <SkeletonBlock style={styles.skeletonKicker} />
          <SkeletonBlock style={styles.skeletonHero} />
          <SkeletonBlock style={styles.skeletonLine} />
        </View>
      )}
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  top: {
    alignItems: "flex-end",
    paddingHorizontal: spacing.lg,
  },
  close: {
    width: CLOSE_HIT,
    height: CLOSE_HIT,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  skeletonKicker: {
    width: 140,
    height: 16,
    borderRadius: radius.sm,
  },
  skeletonHero: {
    width: "80%",
    height: 84,
    borderRadius: radius.md,
  },
  skeletonLine: {
    width: "60%",
    height: 22,
    borderRadius: radius.sm,
  },
}));

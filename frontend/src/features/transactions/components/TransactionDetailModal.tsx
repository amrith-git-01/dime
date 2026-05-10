import { format, parseISO } from "date-fns";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Animated,
    Easing,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fontFamilies } from "@/constants/fonts";
import { colors, spacing, typography } from "@/constants/theme";
import { detectedViaLabel } from "@/features/transactions/detectedViaLabel";
import { formatInrAmount } from "@/features/transactions/formatAmount";
import type { TransactionRow } from "@/features/transactions/types";

const OPEN_MS = 220;
const CLOSE_MS = 180;

type Props = {
  visible: boolean;
  onClose: () => void;
  transaction: TransactionRow | null;
};

function formatIsoHuman(iso: string | null | undefined): string {
  if (iso == null || iso.length === 0) {
    return "—";
  }
  try {
    return format(parseISO(iso), "d MMM yyyy, h:mm a");
  } catch {
    return iso;
  }
}

export function TransactionDetailModal({
  visible,
  onClose,
  transaction,
}: Props) {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [mounted, setMounted] = useState(false);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateX = useRef(new Animated.Value(windowWidth)).current;
  const openFrameRef = useRef<number | null>(null);

  const openAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const closeAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const lastTransactionRef = useRef<TransactionRow | null>(null);

  if (transaction) {
    lastTransactionRef.current = transaction;
  }
  const displayTransaction = transaction ?? lastTransactionRef.current;

  const runClose = useCallback(() => {
    openAnimRef.current?.stop();
    closeAnimRef.current?.stop();

    const closeAnim = Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: CLOSE_MS,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateX, {
        toValue: -windowWidth,
        duration: CLOSE_MS,
        useNativeDriver: true,
      }),
    ]);
    closeAnimRef.current = closeAnim;
    closeAnim.start(({ finished }) => {
      closeAnimRef.current = null;
      if (finished) {
        setMounted(false);
        onClose();
      }
    });
  }, [onClose, overlayOpacity, sheetTranslateX, windowWidth]);

  useEffect(() => {
    if (visible && transaction) {
      setMounted(true);
      overlayOpacity.setValue(0);
      sheetTranslateX.setValue(windowWidth);

      openAnimRef.current?.stop();
      closeAnimRef.current?.stop();
      if (openFrameRef.current != null) {
        cancelAnimationFrame(openFrameRef.current);
      }
      openFrameRef.current = requestAnimationFrame(() => {
        const openAnim = Animated.parallel([
          Animated.timing(overlayOpacity, {
            toValue: 1,
            duration: OPEN_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(sheetTranslateX, {
            toValue: 0,
            duration: OPEN_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]);
        openAnimRef.current = openAnim;
        openAnim.start(() => {
          openAnimRef.current = null;
          openFrameRef.current = null;
        });
      });
    }
  }, [visible, transaction, overlayOpacity, sheetTranslateX, windowWidth]);

  useEffect(() => {
    return () => {
      if (openFrameRef.current != null) {
        cancelAnimationFrame(openFrameRef.current);
      }
    };
  }, []);

  if (!mounted || !displayTransaction) {
    return null;
  }

  const tx = displayTransaction;
  const sheetHorizontalPad = spacing.lg;
  const maxSheetWidth = Math.min(560, windowWidth - sheetHorizontalPad * 2);
  const sheetMaxHeight = Math.min(
    Math.round(windowHeight * 0.56),
    windowHeight - insets.top - insets.bottom - spacing.xl * 2,
  );

  return (
    <Modal
      visible={mounted}
      animationType="none"
      transparent
      onRequestClose={runClose}
      statusBarTranslucent
    >
      <View style={styles.root} pointerEvents="box-none">
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Close transaction details"
          onPress={runClose}
        >
          <Animated.View
            style={[styles.backdrop, { opacity: overlayOpacity }]}
            pointerEvents="none"
          />
        </Pressable>

        <View
          style={[
            styles.sheetWrap,
            {
              paddingTop: insets.top + spacing.md,
              paddingBottom: insets.bottom + spacing.md,
              paddingHorizontal: sheetHorizontalPad,
            },
          ]}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.sheet,
              {
                maxHeight: sheetMaxHeight,
                maxWidth: maxSheetWidth,
                transform: [{ translateX: sheetTranslateX }],
              },
            ]}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.title}>Transaction</Text>
              <Pressable
                onPress={runClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={styles.closeIcon}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.heroStrip}>
              <Text style={styles.heroMerchant} numberOfLines={2}>
                {tx.merchant || tx.counterparty_name?.trim() || "—"}
              </Text>
              <Text
                style={[
                  styles.heroAmount,
                  tx.type === "credit"
                    ? styles.amountCredit
                    : styles.amountDebit,
                ]}
              >
                {formatInrAmount(tx.amount, { signed: true, type: tx.type })}
              </Text>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator
              bounces
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              <DetailBlock label="Category">
                <Text style={styles.bodyText} selectable>
                  {tx.category ?? "Uncategorized"}
                </Text>
              </DetailBlock>

              <DetailBlock label="Detected via">
                <Text style={styles.bodyText}>
                  {detectedViaLabel(tx.detected_via)}
                </Text>
              </DetailBlock>

              <DetailBlock label="When">
                <Text style={styles.bodyTextMono} selectable>
                  {formatIsoHuman(tx.transaction_at)}
                </Text>
              </DetailBlock>

              <DetailBlock label="Counterparty">
                <Text style={styles.bodyText} selectable>
                  {tx.counterparty_name?.trim() || "—"}
                </Text>
                <Text style={styles.caption}>{tx.counterparty_type}</Text>
              </DetailBlock>

              <DetailBlock label="Notes" isLast>
                {tx.note?.trim() ? (
                  <Text style={styles.bodyText} selectable>
                    {tx.note.trim()}
                  </Text>
                ) : (
                  <Text style={styles.muted}>—</Text>
                )}
              </DetailBlock>
            </ScrollView>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

function DetailBlock({
  label,
  children,
  isLast,
}: {
  label: string;
  children: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.block, isLast && styles.blockLast]}>
      <Text style={styles.blockLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10, 10, 31, 0.42)",
  },
  sheetWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  sheet: {
    width: "100%",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
    borderRadius: 20,
    backgroundColor: colors.barBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    shadowColor: "#6355E8",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 12,
    zIndex: 2,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  closeIcon: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 22,
    color: colors.textSecondary,
    padding: spacing.xs,
  },
  heroStrip: {
    paddingBottom: spacing.md,
    marginBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
    gap: spacing.xs,
  },
  heroMerchant: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  heroAmount: {
    fontFamily: typography.monoEmphasis.fontFamily,
    fontSize: 20,
    lineHeight: 28,
  },
  amountCredit: {
    color: colors.success,
  },
  amountDebit: {
    color: "#DC2626",
  },
  scroll: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingBottom: spacing.lg,
  },
  block: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
  },
  blockLast: {
    borderBottomWidth: 0,
  },
  blockLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  bodyText: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  bodyTextMono: {
    fontFamily: typography.monoEmphasis.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  caption: {
    marginTop: 4,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  muted: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
});

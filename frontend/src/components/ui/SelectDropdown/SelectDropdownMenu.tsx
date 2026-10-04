import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { colors, overlays, radius, spacing } from "@/constants";

import type { SelectDropdownOption } from "./SelectDropdown";
import { SelectDropdownOptionRow } from "./SelectDropdownOptionRow";
import {
  PANEL_MAX_HEIGHT,
  type MenuRect,
  type SelectDropdownSize,
  type SelectDropdownVariant,
} from "./selectDropdownLayout";

type SelectDropdownMenuProps<T extends string> = {
  open: boolean;
  menuRect: MenuRect | null;
  options: readonly SelectDropdownOption<T>[];
  value: T;
  size: SelectDropdownSize;
  variant: SelectDropdownVariant;
  maxVisibleOptions?: number;
  /** Height of the scrollable option list before it is clamped to the space available. */
  panelScrollHeight: number;
  onSelect: (next: T) => void;
  onClose: () => void;
};

/** Full-screen modal that hosts the option panel at the measured trigger position. */
export function SelectDropdownMenu<T extends string>({
  open,
  menuRect,
  options,
  value,
  size,
  variant,
  maxVisibleOptions,
  panelScrollHeight,
  onSelect,
  onClose,
}: SelectDropdownMenuProps<T>) {
  const showScrollIndicator = maxVisibleOptions
    ? options.length > maxVisibleOptions
    : options.length > 5;

  const panelChromeHeight = panelScrollHeight + spacing.xs * 2;

  const scrollViewportHeight = maxVisibleOptions
    ? panelScrollHeight
    : menuRect != null
      ? Math.min(menuRect.maxHeight, panelScrollHeight)
      : panelScrollHeight;

  const panelVariantStyle =
    variant === "primary"
      ? styles.panelPrimary
      : variant === "secondary"
        ? styles.panelSecondary
        : null;

  const optionsPanel = (
    <ScrollView
      bounces={false}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      scrollEnabled
      showsVerticalScrollIndicator={showScrollIndicator}
      style={[
        styles.panelScroll,
        maxVisibleOptions
          ? {
              height: scrollViewportHeight,
              maxHeight: scrollViewportHeight,
            }
          : { maxHeight: scrollViewportHeight },
      ]}
      contentContainerStyle={styles.panelScrollContent}
    >
      {options.map((item, index) => (
        <SelectDropdownOptionRow
          key={item.value}
          value={item.value}
          label={item.label}
          selected={item.value === value}
          isLast={index === options.length - 1}
          size={size}
          variant={variant}
          onSelect={onSelect as (next: string) => void}
        />
      ))}
    </ScrollView>
  );

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          style={styles.backdrop}
          onPress={onClose}
        />
        {menuRect ? (
          <View
            pointerEvents="box-none"
            onStartShouldSetResponder={() => true}
            style={[
              styles.panel,
              styles.panelOverlay,
              panelVariantStyle,
              size === "compact" && styles.panelCompact,
              maxVisibleOptions
                ? {
                    top: menuRect.top,
                    left: menuRect.left,
                    width: menuRect.width,
                    height: panelChromeHeight,
                    maxHeight: panelChromeHeight,
                  }
                : {
                    top: menuRect.top,
                    left: menuRect.left,
                    width: menuRect.width,
                    maxHeight: menuRect.maxHeight,
                  },
            ]}
          >
            {optionsPanel}
          </View>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: overlays.backdrop,
    zIndex: 0,
  },
  panel: {
    backgroundColor: colors.barBackground,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: spacing.xs,
    overflow: "hidden",
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 24,
  },
  panelOverlay: {
    position: "absolute",
    zIndex: 2,
    elevation: 24,
  },
  panelCompact: {
    minWidth: 120,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  panelPrimary: {
    minWidth: 104,
  },
  panelSecondary: {
    minWidth: 120,
  },
  panelScroll: {
    maxHeight: PANEL_MAX_HEIGHT,
  },
  panelScrollContent: {
    flexGrow: 0,
  },
});

import { forwardRef, memo } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { bento, colors } from "@/constants/theme";

export type BudgetLimitAmountVariant = "onDark" | "onPastel";

/** Matches preset amount row in `BudgetLimitBentoTile`. */
const AMOUNT_FONT_SIZE = 24;
const AMOUNT_LINE_HEIGHT = 30;

type BudgetLimitAmountInputProps = {
  value: string;
  onChangeText: (text: string) => void;
  variant: BudgetLimitAmountVariant;
  showSoftInputOnFocus?: boolean;
  onSubmitEditing?: () => void;
};

export const BudgetLimitAmountInput = memo(
  forwardRef<TextInput, BudgetLimitAmountInputProps>(
    function BudgetLimitAmountInput(
      {
        value,
        onChangeText,
        variant,
        showSoftInputOnFocus = true,
        onSubmitEditing,
      },
      ref,
    ) {
      const textColor =
        variant === "onDark" ? bento.onSurface.primary : bento.onPastel.primary;
      const placeholderColor =
        variant === "onDark" ? bento.onSurface.muted : colors.inactive;
      const isEmpty = value.trim().length === 0;

      return (
        <View style={styles.shell}>
          <View style={styles.prefixWrap}>
            <Text style={[styles.amountGlyph, { color: textColor }]}>₹</Text>
          </View>

          <View style={styles.inputWrap}>
            {isEmpty ? (
              <Text
                style={[
                  styles.amountGlyph,
                  styles.placeholderGuide,
                  { color: placeholderColor },
                ]}
                pointerEvents="none"
              >
                0
              </Text>
            ) : null}
            <TextInput
              ref={ref}
              style={[styles.input, { color: textColor }]}
              placeholder=""
              keyboardType="decimal-pad"
              value={value}
              onChangeText={onChangeText}
              editable
              showSoftInputOnFocus={showSoftInputOnFocus}
              underlineColorAndroid="transparent"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              caretHidden={false}
              onSubmitEditing={onSubmitEditing}
            />
          </View>
        </View>
      );
    },
  ),
);

const styles = StyleSheet.create({
  shell: {
    flexDirection: "row",
    alignItems: "center",
    height: AMOUNT_LINE_HEIGHT,
  },
  prefixWrap: {
    marginRight: 2,
    height: AMOUNT_LINE_HEIGHT,
    justifyContent: "center",
  },
  inputWrap: {
    flex: 1,
    height: AMOUNT_LINE_HEIGHT,
    justifyContent: "center",
  },
  amountGlyph: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: AMOUNT_FONT_SIZE,
    lineHeight: AMOUNT_LINE_HEIGHT,
    ...Platform.select({
      android: { includeFontPadding: false },
    }),
  },
  placeholderGuide: {
    position: "absolute",
    left: 0,
    height: AMOUNT_LINE_HEIGHT,
  },
  input: {
    flex: 1,
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: AMOUNT_FONT_SIZE,
    padding: 0,
    margin: 0,
    height: AMOUNT_LINE_HEIGHT,
    ...Platform.select({
      android: {
        includeFontPadding: false,
        textAlignVertical: "center",
        lineHeight: AMOUNT_LINE_HEIGHT,
        paddingVertical: 0,
      },
      ios: {
        lineHeight: AMOUNT_LINE_HEIGHT,
        paddingVertical: 0,
      },
    }),
  },
});

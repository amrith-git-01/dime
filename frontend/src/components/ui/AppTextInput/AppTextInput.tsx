import { forwardRef, useCallback, useRef, useState } from "react";
import {
  Pressable,
  TextInput,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

import { useThemedTextInputProps } from "@/theme";

export type AppTextInputProps = TextInputProps & {
  /** Layout of the touch wrapper (it must occupy the slot the bare input used to). */
  containerStyle?: StyleProp<ViewStyle>;
};

/**
 * The one TextInput used by the app.
 *
 * Why: on Android a native EditText swallows the whole gesture when the finger starts on it,
 * so a parent ScrollView cannot scroll (especially multiline). While unfocused the input is
 * `pointerEvents="none"` and a Pressable wrapper owns the touch: a drag scrolls the parent,
 * a tap focuses the input. Once focused the input receives touches normally (caret, selection).
 */
export const AppTextInput = forwardRef<TextInput, AppTextInputProps>(
  function AppTextInput(
    { containerStyle, onFocus, onBlur, editable = true, ...rest },
    forwardedRef,
  ) {
    const themedProps = useThemedTextInputProps();
    const innerRef = useRef<TextInput | null>(null);
    const [focused, setFocused] = useState(false);

    const setRefs = useCallback(
      (node: TextInput | null) => {
        innerRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef],
    );

    return (
      <Pressable
        accessible={false}
        disabled={focused || editable === false}
        onPress={() => innerRef.current?.focus()}
        style={containerStyle}
      >
        <TextInput
          {...themedProps}
          {...rest}
          ref={setRefs}
          editable={editable}
          pointerEvents={focused ? "auto" : "none"}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
        />
      </Pressable>
    );
  },
);

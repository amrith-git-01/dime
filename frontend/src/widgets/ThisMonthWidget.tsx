import { FlexWidget, TextWidget, type ColorProp } from "react-native-android-widget";

import { lightColors } from "@/theme/palettes";

/** The widget runtime only takes literal hex strings; the palette types them as plain `string`. */
const hex = (value: string) => value as ColorProp;

/**
 * Phase 0 spike: static "This month" widget, light palette only, placeholder amount.
 *
 * "use no memo": react-native-android-widget calls widget components as plain functions (no React
 * renderer), so the React Compiler's `useMemoCache` would throw "Cannot read property 'useMemoCache' of null".
 */
export function ThisMonthWidget() {
  "use no memo";
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel="Open Dime"
      style={{
        height: "match_parent",
        width: "match_parent",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 16,
        borderRadius: 24,
        backgroundColor: hex(lightColors.surface),
      }}
    >
      <TextWidget
        text="This month"
        style={{ fontSize: 13, fontWeight: "600", color: hex(lightColors.inkSoft) }}
      />
      <TextWidget
        text="₹—"
        style={{ fontSize: 30, fontWeight: "700", color: hex(lightColors.ink) }}
      />
      <TextWidget
        text="Open Dime"
        style={{ fontSize: 13, fontWeight: "600", color: hex(lightColors.accentText) }}
      />
    </FlexWidget>
  );
}

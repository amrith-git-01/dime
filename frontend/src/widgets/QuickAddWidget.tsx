"use no memo";
// See ThisMonthWidget: the widget runtime calls these as plain functions, so the React Compiler
// must stay off in this file.

import { FlexWidget, TextWidget } from "react-native-android-widget";

import { deepLinkUrls } from "@/lib/deepLinks/deepLinkUrls";
import type { ThemeColors } from "@/theme/palettes";

import { hex } from "./widgetTheme";

type QuickAddWidgetProps = { colors: ThemeColors };

const BUTTONS = [
  { label: "+ Add", a11y: "Add a transaction", uri: deepLinkUrls.addToday, primary: true },
  { label: "Scan", a11y: "Scan a receipt", uri: deepLinkUrls.scan, primary: false },
  { label: "Voice", a11y: "Add by voice", uri: deepLinkUrls.voice, primary: false },
] as const;

export function QuickAddWidget({ colors }: QuickAddWidgetProps) {
  return (
    <FlexWidget
      accessibilityLabel="Dime quick add"
      style={{
        height: "match_parent",
        width: "match_parent",
        flexDirection: "row",
        alignItems: "center",
        padding: 10,
        borderRadius: 24,
        backgroundColor: hex(colors.surface),
      }}
    >
      {BUTTONS.map((button, index) => (
        <FlexWidget
          key={button.label}
          clickAction="OPEN_URI"
          clickActionData={{ uri: button.uri }}
          accessibilityLabel={button.a11y}
          style={{
            flex: 1,
            width: 0,
            height: "match_parent",
            marginLeft: index === 0 ? 0 : 8,
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            borderRadius: 16,
            backgroundColor: hex(button.primary ? colors.accent : colors.surfaceSunken),
          }}
        >
          <TextWidget
            text={button.label}
            style={{
              fontSize: 15,
              fontWeight: "700",
              color: hex(button.primary ? colors.onAccent : colors.ink),
            }}
          />
        </FlexWidget>
      ))}
    </FlexWidget>
  );
}

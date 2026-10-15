"use no memo";
// See ThisMonthWidget: the widget runtime calls these as plain functions, so the React Compiler
// must stay off in this file.

import { FlexWidget, TextWidget } from "react-native-android-widget";

import { deepLinkUrls } from "@/lib/deepLinks/deepLinkUrls";
import type { ThemeColors } from "@/theme/palettes";

import type { QuickAddModel, QuickAddStatus } from "./quickAddModel";
import { hex } from "./widgetTheme";

type QuickAddWidgetProps = { colors: ThemeColors; model: QuickAddModel };

/** Click actions handled by `widgetTaskHandler` (the library only opens URIs by itself). */
export const PRESET_CLICK_ACTION = "PRESET";
export const UNDO_CLICK_ACTION = "UNDO";

const BUTTONS = [
  { label: "+ Add", a11y: "Add a transaction", uri: deepLinkUrls.addToday, primary: true },
  { label: "Scan", a11y: "Scan a receipt", uri: deepLinkUrls.scan, primary: false },
  { label: "Voice", a11y: "Add by voice", uri: deepLinkUrls.voice, primary: false },
] as const;

function ActionButtons({ colors, grow }: { colors: ThemeColors; grow: boolean }) {
  return (
    <FlexWidget
      style={{
        flexDirection: "row",
        alignItems: "center",
        width: "match_parent",
        // 4x1: fill the widget. 4x2: share the height with the preset row.
        ...(grow ? { flex: 1, height: 0 } : { height: "match_parent" }),
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

function PresetRow({ colors, model }: QuickAddWidgetProps) {
  const rowStyle = {
    flexDirection: "row",
    alignItems: "center",
    width: "match_parent",
    flex: 1,
    height: 0,
    marginTop: 6,
  } as const;

  if (model.showSetup) {
    return (
      <FlexWidget style={rowStyle}>
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: deepLinkUrls.settingsWidgets }}
          accessibilityLabel="Set up one-tap presets"
          style={{
            flex: 1,
            width: 0,
            height: "match_parent",
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            borderRadius: 14,
            backgroundColor: hex(colors.surfaceSunken),
          }}
        >
          <TextWidget
            text="Set up presets"
            style={{ fontSize: 13, fontWeight: "600", color: hex(colors.accentText) }}
          />
        </FlexWidget>
      </FlexWidget>
    );
  }
  return (
    <FlexWidget style={rowStyle}>
      {model.presets.map((preset, position) => (
        <FlexWidget
          key={preset.index}
          clickAction={PRESET_CLICK_ACTION}
          clickActionData={{ index: preset.index }}
          accessibilityLabel={preset.accessibilityLabel}
          style={{
            flex: 1,
            width: 0,
            height: "match_parent",
            marginLeft: position === 0 ? 0 : 8,
            paddingHorizontal: 6,
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            borderRadius: 14,
            backgroundColor: hex(colors.surfaceSunken),
          }}
        >
          <TextWidget
            text={preset.text}
            maxLines={1}
            truncate="END"
            style={{ fontSize: 13, fontWeight: "600", color: hex(colors.ink) }}
          />
        </FlexWidget>
      ))}
    </FlexWidget>
  );
}

/** Rendered only with a status: a widget component must never return null. */
function StatusRow({ colors, status }: { colors: ThemeColors; status: QuickAddStatus }) {
  const failed = status.text.startsWith("Couldn't");
  return (
    <FlexWidget
      clickAction={status.opensApp ? "OPEN_URI" : undefined}
      clickActionData={status.opensApp ? { uri: deepLinkUrls.home } : undefined}
      style={{
        flexDirection: "row",
        alignItems: "center",
        width: "match_parent",
        height: 18,
        marginTop: 6,
      }}
    >
      <FlexWidget style={{ flex: 1, width: 0 }}>
        <TextWidget
          text={status.text}
          maxLines={1}
          truncate="END"
          style={{
            fontSize: 12,
            fontWeight: "600",
            color: hex(failed ? colors.danger : status.opensApp ? colors.accentText : colors.inkSoft),
          }}
        />
      </FlexWidget>
      {status.undo ? (
        <FlexWidget
          clickAction={UNDO_CLICK_ACTION}
          accessibilityLabel="Undo"
          style={{ marginLeft: 8, paddingHorizontal: 6, height: "match_parent", justifyContent: "center" }}
        >
          <TextWidget
            text="Undo"
            style={{ fontSize: 12, fontWeight: "700", color: hex(colors.accentText) }}
          />
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

export function QuickAddWidget({ colors, model }: QuickAddWidgetProps) {
  const rootStyle = {
    height: "match_parent",
    width: "match_parent",
    padding: 10,
    borderRadius: 24,
    backgroundColor: hex(colors.surface),
  } as const;

  if (!model.showPresetRow) {
    // 4x1: just the three buttons.
    return (
      <FlexWidget
        accessibilityLabel="Dime quick add"
        style={{ ...rootStyle, flexDirection: "row", alignItems: "center" }}
      >
        <ActionButtons colors={colors} grow={false} />
      </FlexWidget>
    );
  }

  // 4x2: buttons, one-tap presets, then what the last preset tap did.
  return (
    <FlexWidget
      accessibilityLabel="Dime quick add"
      style={{ ...rootStyle, flexDirection: "column", justifyContent: "flex-start" }}
    >
      <ActionButtons colors={colors} grow />
      {model.presets.length > 0 || model.showSetup ? (
        <PresetRow colors={colors} model={model} />
      ) : null}
      {model.status ? <StatusRow colors={colors} status={model.status} /> : null}
    </FlexWidget>
  );
}

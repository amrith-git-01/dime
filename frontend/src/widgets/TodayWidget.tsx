"use no memo";
// See ThisMonthWidget: the widget runtime calls these as plain functions, so the React Compiler
// must stay off in this file.

import { FlexWidget, TextWidget } from "react-native-android-widget";

import { deepLinkUrls } from "@/lib/deepLinks/deepLinkUrls";
import type { ThemeColors } from "@/theme/palettes";

import type { TodayModel } from "./todayModel";
import { hex } from "./widgetTheme";

type TodayWidgetProps = { model: TodayModel; colors: ThemeColors };

export function TodayWidget({ model, colors }: TodayWidgetProps) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: deepLinkUrls.home }}
      accessibilityLabel={model.accessibilityLabel}
      style={{
        height: "match_parent",
        width: "match_parent",
        flexDirection: "column",
        justifyContent: "center",
        padding: 14,
        borderRadius: 24,
        backgroundColor: hex(colors.surface),
      }}
    >
      <FlexWidget
        style={{ flexDirection: "row", alignItems: "center", width: "match_parent" }}
      >
        <FlexWidget style={{ flex: 1, width: 0 }}>
          <TextWidget
            text={model.title}
            maxLines={1}
            style={{ fontSize: 13, fontWeight: "600", color: hex(colors.inkSoft) }}
          />
        </FlexWidget>
        {model.signedOut ? null : (
          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: deepLinkUrls.addToday }}
            accessibilityLabel="Add a transaction for today"
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: hex(colors.accent),
            }}
          >
            <TextWidget
              text="+"
              style={{ fontSize: 18, fontWeight: "700", color: hex(colors.onAccent) }}
            />
          </FlexWidget>
        )}
      </FlexWidget>
      <TextWidget
        text={model.amount}
        maxLines={1}
        style={{
          fontSize: model.signedOut ? 16 : 26,
          fontWeight: "700",
          color: hex(colors.ink),
        }}
      />
      {model.rows.map((row) => (
        <FlexWidget
          key={row.id}
          style={{
            flexDirection: "row",
            alignItems: "center",
            width: "match_parent",
            marginTop: 6,
          }}
        >
          <FlexWidget style={{ flex: 1, width: 0 }}>
            <TextWidget
              text={row.name}
              maxLines={1}
              truncate="END"
              style={{ fontSize: 12, color: hex(colors.ink) }}
            />
          </FlexWidget>
          <TextWidget
            text={row.amount}
            maxLines={1}
            style={{
              marginLeft: 6,
              fontSize: 12,
              fontWeight: "600",
              color: hex(row.credit ? colors.success : colors.inkSoft),
            }}
          />
        </FlexWidget>
      ))}
      {model.hint ? (
        <TextWidget
          text={model.hint}
          maxLines={1}
          style={{
            marginTop: 6,
            fontSize: 12,
            fontWeight: "600",
            color: hex(model.signedOut || model.rows.length === 0 ? colors.accentText : colors.inkFaint),
          }}
        />
      ) : null}
    </FlexWidget>
  );
}

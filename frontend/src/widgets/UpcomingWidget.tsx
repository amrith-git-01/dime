"use no memo";
// See ThisMonthWidget: the widget runtime calls these as plain functions, so the React Compiler
// must stay off in this file.

import { FlexWidget, TextWidget } from "react-native-android-widget";

import { deepLinkUrls } from "@/lib/deepLinks/deepLinkUrls";
import type { ThemeColors } from "@/theme/palettes";

import type { UpcomingModel } from "./upcomingModel";
import { hex } from "./widgetTheme";

type UpcomingWidgetProps = { model: UpcomingModel; colors: ThemeColors };

export function UpcomingWidget({ model, colors }: UpcomingWidgetProps) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{
        uri: model.signedOut ? deepLinkUrls.home : deepLinkUrls.budgetsRecurring,
      }}
      accessibilityLabel={model.accessibilityLabel}
      style={{
        height: "match_parent",
        width: "match_parent",
        flexDirection: "column",
        justifyContent: "flex-start",
        padding: 14,
        borderRadius: 24,
        backgroundColor: hex(colors.surface),
      }}
    >
      <TextWidget
        text={model.title}
        maxLines={1}
        style={{ fontSize: 12, fontWeight: "600", color: hex(colors.inkSoft) }}
      />
      {model.message ? (
        <TextWidget
          text={model.message}
          maxLines={2}
          style={{
            marginTop: 6,
            fontSize: 14,
            fontWeight: "600",
            color: hex(model.signedOut ? colors.accentText : colors.inkSoft),
          }}
        />
      ) : null}
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
              style={{ fontSize: 14, fontWeight: "600", color: hex(colors.ink) }}
            />
          </FlexWidget>
          <TextWidget
            text={row.due}
            maxLines={1}
            style={{ marginLeft: 8, fontSize: 12, color: hex(colors.inkSoft) }}
          />
          <TextWidget
            text={row.amount}
            maxLines={1}
            style={{
              marginLeft: 10,
              fontSize: 14,
              fontWeight: "700",
              color: hex(row.income ? colors.success : colors.ink),
            }}
          />
        </FlexWidget>
      ))}
    </FlexWidget>
  );
}

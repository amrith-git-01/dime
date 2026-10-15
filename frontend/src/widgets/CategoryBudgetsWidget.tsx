"use no memo";
// See ThisMonthWidget: the widget runtime calls these as plain functions, so the React Compiler
// must stay off in this file.

import { FlexWidget, TextWidget } from "react-native-android-widget";

import { deepLinkUrls } from "@/lib/deepLinks/deepLinkUrls";
import type { ThemeColors } from "@/theme/palettes";

import type { CategoryBudgetsModel } from "./categoryBudgetsModel";
import { hex } from "./widgetTheme";
import { WidgetProgressBar } from "./WidgetProgressBar";

type CategoryBudgetsWidgetProps = {
  model: CategoryBudgetsModel;
  colors: ThemeColors;
};

export function CategoryBudgetsWidget({ model, colors }: CategoryBudgetsWidgetProps) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{
        uri: model.signedOut || model.message ? deepLinkUrls.home : deepLinkUrls.budgets,
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
      {model.rows.map((row, index) => {
        const tint = row.color ?? colors.accent;
        return (
          <FlexWidget
            key={row.id}
            style={{ flexDirection: "column", width: "match_parent", marginTop: index === 0 ? 6 : 8 }}
          >
            <FlexWidget
              style={{ flexDirection: "row", alignItems: "center", width: "match_parent" }}
            >
              <FlexWidget
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: hex(tint),
                }}
              />
              <FlexWidget style={{ flex: 1, width: 0, marginLeft: 8 }}>
                <TextWidget
                  text={row.name}
                  maxLines={1}
                  truncate="END"
                  style={{ fontSize: 13, fontWeight: "600", color: hex(colors.ink) }}
                />
              </FlexWidget>
              <TextWidget
                text={row.amountText}
                maxLines={1}
                style={{
                  marginLeft: 8,
                  fontSize: 12,
                  color: hex(row.overBudget ? colors.danger : colors.inkSoft),
                }}
              />
            </FlexWidget>
            <WidgetProgressBar
              percent={row.percent}
              fill={row.overBudget ? colors.danger : tint}
              track={colors.surfaceSunken}
              marginTop={4}
              height={5}
            />
          </FlexWidget>
        );
      })}
    </FlexWidget>
  );
}

"use no memo";
// react-native-android-widget calls widget components as plain functions (no React renderer), so
// the React Compiler's `useMemoCache` would throw "Cannot read property 'useMemoCache' of null".

import { FlexWidget, TextWidget } from "react-native-android-widget";

import { deepLinkUrls } from "@/lib/deepLinks/deepLinkUrls";
import type { ThemeColors } from "@/theme/palettes";

import type { ThisMonthLayout, ThisMonthModel } from "./thisMonthModel";
import { hex } from "./widgetTheme";

type ThisMonthWidgetProps = {
  model: ThisMonthModel;
  colors: ThemeColors;
  layout: ThisMonthLayout;
  /** Room for the Recurring / Flexible line (3+ rows tall). */
  showSplit: boolean;
};

function ProgressBar({
  percent,
  fill,
  track,
  marginTop,
}: {
  percent: number;
  fill: string;
  track: string;
  marginTop: number;
}) {
  return (
    <FlexWidget
      style={{
        flexDirection: "row",
        width: "match_parent",
        height: 6,
        marginTop,
        borderRadius: 3,
        backgroundColor: hex(track),
      }}
    >
      <FlexWidget
        style={{
          width: 0,
          flex: percent,
          height: "match_parent",
          borderRadius: 3,
          backgroundColor: hex(fill),
        }}
      />
      {percent < 100 ? (
        <FlexWidget style={{ width: 0, flex: 100 - percent, height: "match_parent" }} />
      ) : null}
    </FlexWidget>
  );
}

export function ThisMonthWidget({
  model,
  colors,
  layout,
  showSplit,
}: ThisMonthWidgetProps) {
  const fill = model.overBudget ? colors.danger : colors.accent;
  const bar =
    model.progressPercent === null ? null : (
      <ProgressBar
        percent={model.progressPercent}
        fill={fill}
        track={colors.surfaceSunken}
        marginTop={layout === "compact" ? 6 : 10}
      />
    );
  const rootStyle = {
    height: "match_parent",
    width: "match_parent",
    borderRadius: 24,
    backgroundColor: hex(colors.surface),
  } as const;

  if (layout === "compact") {
    // 4x1: amount on the left, budget text and bar on the right.
    const sideLine = model.budgetLine ?? model.hint ?? model.splitLine;
    return (
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: deepLinkUrls.home }}
        accessibilityLabel={model.accessibilityLabel}
        style={{
          ...rootStyle,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 8,
        }}
      >
        <FlexWidget style={{ flexDirection: "column", justifyContent: "center" }}>
          <TextWidget
            text={model.title}
            style={{ fontSize: 12, fontWeight: "600", color: hex(colors.inkSoft) }}
          />
          <TextWidget
            text={model.amount}
            maxLines={1}
            style={{
              fontSize: model.signedOut ? 16 : 24,
              fontWeight: "700",
              color: hex(colors.ink),
            }}
          />
        </FlexWidget>
        <FlexWidget
          style={{
            flex: 1,
            width: 0,
            marginLeft: 16,
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          {sideLine ? (
            <TextWidget
              text={sideLine}
              maxLines={1}
              truncate="END"
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: hex(model.budgetLine ? colors.inkSoft : colors.accentText),
              }}
            />
          ) : null}
          {bar}
        </FlexWidget>
      </FlexWidget>
    );
  }

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: deepLinkUrls.home }}
      accessibilityLabel={model.accessibilityLabel}
      style={{
        ...rootStyle,
        flexDirection: "column",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <TextWidget
        text={model.title}
        style={{ fontSize: 13, fontWeight: "600", color: hex(colors.inkSoft) }}
      />
      <TextWidget
        text={model.amount}
        maxLines={1}
        style={{
          fontSize: model.signedOut ? 20 : 30,
          fontWeight: "700",
          color: hex(colors.ink),
        }}
      />
      {bar}
      {model.budgetLine ? (
        <TextWidget
          text={model.budgetLine}
          maxLines={1}
          truncate="END"
          style={{
            marginTop: 6,
            fontSize: 12,
            fontWeight: "600",
            color: hex(model.overBudget ? colors.danger : colors.inkSoft),
          }}
        />
      ) : null}
      {showSplit && model.splitLine ? (
        <TextWidget
          text={model.splitLine}
          maxLines={1}
          truncate="END"
          style={{ marginTop: 4, fontSize: 11, color: hex(colors.inkFaint) }}
        />
      ) : null}
      {model.hint ? (
        <TextWidget
          text={model.hint}
          maxLines={1}
          style={{
            marginTop: 4,
            fontSize: 12,
            fontWeight: "600",
            color: hex(colors.accentText),
          }}
        />
      ) : null}
    </FlexWidget>
  );
}

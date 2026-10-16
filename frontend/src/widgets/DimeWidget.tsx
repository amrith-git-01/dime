"use no memo";
// react-native-android-widget calls widget components as plain functions (no React renderer), so
// the React Compiler's `useMemoCache` would throw "Cannot read property 'useMemoCache' of null".

import { FlexWidget, SvgWidget, TextWidget } from "react-native-android-widget";

import { cardLinkUrl, deepLinkUrls } from "@/lib/deepLinks/deepLinkUrls";
import type { ThemeColors } from "@/theme/palettes";

import type {
  DimeWidgetCategoryRow,
  DimeWidgetLayout,
  DimeWidgetModel,
} from "./dimeWidgetModel";
import { widgetIconSvg, type WidgetIconName } from "./widgetIcons";
import { hex } from "./widgetTheme";
import { WidgetProgressBar } from "./WidgetProgressBar";

type DimeWidgetProps = {
  model: DimeWidgetModel;
  colors: ThemeColors;
  layout: DimeWidgetLayout;
  /** Room for the categories column next to the month column. */
  showCategories: boolean;
  /** This install's card token (`getWidgetCardToken`), carried by the Add / Scan / Gallery / Voice links. */
  cardToken: string;
};

type ActionButton = {
  icon: WidgetIconName;
  label: string;
  uri: string;
  /** The primary action: accent filled. */
  primary?: boolean;
};

function actionButtons(cardToken: string): readonly ActionButton[] {
  return [
    { icon: "add", label: "Add", uri: cardLinkUrl("add", cardToken), primary: true },
    { icon: "scan", label: "Scan", uri: cardLinkUrl("scan", cardToken) },
    { icon: "gallery", label: "Gallery", uri: cardLinkUrl("gallery", cardToken) },
    { icon: "voice", label: "Voice", uri: cardLinkUrl("voice", cardToken) },
    { icon: "ask", label: "Ask AI", uri: deepLinkUrls.agent },
  ];
}

function ActionRow({ colors, cardToken }: { colors: ThemeColors; cardToken: string }) {
  return (
    <FlexWidget style={{ flexDirection: "row", width: "match_parent", marginTop: 8 }}>
      {actionButtons(cardToken).map((button, index) => {
        const labelColor = button.primary ? colors.onAccent : colors.ink;
        return (
          <FlexWidget
            key={button.label}
            clickAction="OPEN_URI"
            clickActionData={{ uri: button.uri }}
            accessibilityLabel={button.label}
            style={{
              flex: 1,
              width: 0,
              height: 52,
              marginLeft: index === 0 ? 0 : 6,
              borderRadius: 16,
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: hex(button.primary ? colors.accent : colors.surfaceSunken),
            }}
          >
            <SvgWidget
              svg={widgetIconSvg(button.icon, labelColor)}
              style={{ width: 20, height: 20 }}
            />
            <TextWidget
              text={button.label}
              maxLines={1}
              style={{
                marginTop: 3,
                fontSize: 10,
                fontWeight: "600",
                color: hex(labelColor),
              }}
            />
          </FlexWidget>
        );
      })}
    </FlexWidget>
  );
}

function CategoryRow({
  row,
  colors,
  first,
}: {
  row: DimeWidgetCategoryRow;
  colors: ThemeColors;
  first: boolean;
}) {
  const tint = row.color ?? colors.accent;
  return (
    <FlexWidget
      style={{ flexDirection: "column", width: "match_parent", marginTop: first ? 0 : 7 }}
    >
      <FlexWidget style={{ flexDirection: "row", alignItems: "center", width: "match_parent" }}>
        <FlexWidget
          style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: hex(tint) }}
        />
        <FlexWidget style={{ flex: 1, width: 0, marginLeft: 6 }}>
          <TextWidget
            text={row.name}
            maxLines={1}
            truncate="END"
            style={{ fontSize: 12, fontWeight: "600", color: hex(colors.ink) }}
          />
        </FlexWidget>
        <TextWidget
          text={row.amountText}
          maxLines={1}
          style={{
            marginLeft: 6,
            fontSize: 11,
            color: hex(row.overBudget ? colors.danger : colors.inkSoft),
          }}
        />
      </FlexWidget>
      <WidgetProgressBar
        percent={row.percent}
        fill={row.overBudget ? colors.danger : tint}
        track={colors.surfaceSunken}
        marginTop={3}
        height={4}
      />
    </FlexWidget>
  );
}

/** Never rendered without a status: the library crashes on a component that returns null. */
function StatusLine({
  status,
  colors,
}: {
  status: NonNullable<DimeWidgetModel["status"]>;
  colors: ThemeColors;
}) {
  return (
    <TextWidget
      text={status.text}
      maxLines={1}
      truncate="END"
      style={{
        marginTop: 6,
        fontSize: 12,
        fontWeight: "600",
        color: hex(
          status.kind === "failed"
            ? colors.danger
            : status.kind === "added"
              ? colors.success
              : colors.inkSoft,
        ),
      }}
    />
  );
}

/** The month column: title, amount, budget bar and line, split line. */
function MonthColumn({
  model,
  colors,
  showSplit,
}: {
  model: DimeWidgetModel;
  colors: ThemeColors;
  showSplit: boolean;
}) {
  const fill = model.overBudget ? colors.danger : colors.accent;
  return (
    <FlexWidget style={{ flexDirection: "column", flex: 1, width: 0 }}>
      <TextWidget
        text={model.title}
        maxLines={1}
        style={{ fontSize: 11, fontWeight: "600", color: hex(colors.inkSoft) }}
      />
      <TextWidget
        text={model.amount}
        maxLines={1}
        style={{
          fontSize: model.signedOut ? 18 : 26,
          fontWeight: "700",
          color: hex(colors.ink),
        }}
      />
      {model.progressPercent === null ? null : (
        <WidgetProgressBar
          percent={model.progressPercent}
          fill={fill}
          track={colors.surfaceSunken}
          marginTop={6}
        />
      )}
      {model.budgetLine ? (
        <TextWidget
          text={model.budgetLine}
          maxLines={1}
          truncate="END"
          style={{
            marginTop: 5,
            fontSize: 12,
            fontWeight: "600",
            color: hex(model.overBudget ? colors.danger : colors.inkSoft),
          }}
        />
      ) : null}
      {showSplit && model.splitLine ? (
        <TextWidget
          text={model.splitLine}
          maxLines={2}
          truncate="END"
          style={{ marginTop: 3, fontSize: 11, color: hex(colors.inkFaint) }}
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

export function DimeWidget({
  model,
  colors,
  layout,
  showCategories,
  cardToken,
}: DimeWidgetProps) {
  const full = layout === "full";
  const categories = full && showCategories ? model.categories : [];
  const rootStyle = {
    height: "match_parent",
    width: "match_parent",
    flexDirection: "column",
    padding: 14,
    borderRadius: 24,
    backgroundColor: hex(colors.surface),
  } as const;

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: deepLinkUrls.home }}
      accessibilityLabel={model.accessibilityLabel}
      style={rootStyle}
    >
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: deepLinkUrls.home }}
        style={{ flexDirection: "row", width: "match_parent", flex: 1, height: 0 }}
      >
        <MonthColumn model={model} colors={colors} showSplit={full} />
        {categories.length > 0 ? (
          <FlexWidget
            style={{ flexDirection: "column", flex: 1, width: 0, marginLeft: 14, paddingTop: 2 }}
          >
            {categories.map((row, index) => (
              <CategoryRow key={row.id} row={row} colors={colors} first={index === 0} />
            ))}
          </FlexWidget>
        ) : null}
      </FlexWidget>
      {model.status ? <StatusLine status={model.status} colors={colors} /> : null}
      {model.signedOut ? null : <ActionRow colors={colors} cardToken={cardToken} />}
    </FlexWidget>
  );
}

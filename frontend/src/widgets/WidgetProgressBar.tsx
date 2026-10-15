"use no memo";
// See ThisMonthWidget: the widget runtime calls these as plain functions, so the React Compiler
// must stay off in this file.

import { FlexWidget } from "react-native-android-widget";

import { hex } from "./widgetTheme";

/** A progress bar drawn as two weighted segments (the runtime has no percent widths). */
export function WidgetProgressBar({
  percent,
  fill,
  track,
  marginTop,
  height = 6,
}: {
  /** 0..100. */
  percent: number;
  fill: string;
  track: string;
  marginTop: number;
  height?: number;
}) {
  const radius = height / 2;
  return (
    <FlexWidget
      style={{
        flexDirection: "row",
        width: "match_parent",
        height,
        marginTop,
        borderRadius: radius,
        backgroundColor: hex(track),
      }}
    >
      {percent > 0 ? (
        <FlexWidget
          style={{
            width: 0,
            flex: percent,
            height: "match_parent",
            borderRadius: radius,
            backgroundColor: hex(fill),
          }}
        />
      ) : null}
      {percent < 100 ? (
        <FlexWidget style={{ width: 0, flex: 100 - percent, height: "match_parent" }} />
      ) : null}
    </FlexWidget>
  );
}

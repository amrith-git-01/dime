import type { ReactElement } from "react";

type Node = ReactElement<Record<string, unknown>> | string | number | boolean | null | undefined | Node[];

/**
 * Expands widget JSX the way react-native-android-widget does: custom function components are
 * called as plain functions until a library primitive (tagged `__name__`) is reached. Returns every
 * primitive element in document order.
 */
export function flattenWidgetTree(node: Node): ReactElement<Record<string, unknown>>[] {
  if (node === null || node === undefined || typeof node !== "object") {
    return [];
  }
  if (Array.isArray(node)) {
    return node.flatMap(flattenWidgetTree);
  }
  if (
    typeof node.type === "function" &&
    !(node.type as { __name__?: string }).__name__
  ) {
    // A custom component: call it as the library does. The library cannot take a component that
    // renders nothing (null/undefined/false): it would crash the whole widget, so fail here too.
    const rendered = (node.type as (props: unknown) => Node)(node.props);
    if (rendered === null || rendered === undefined || typeof rendered === "boolean") {
      throw new Error(
        `Widget component ${(node.type as { name?: string }).name ?? "(anonymous)"} returned ${String(rendered)}; ` +
          "render the conditional in the parent instead (react-native-android-widget crashes on it).",
      );
    }
    return flattenWidgetTree(rendered);
  }
  return [node, ...flattenWidgetTree(node.props.children as Node)];
}

export function widgetTexts(node: Node): string[] {
  return flattenWidgetTree(node)
    .map((element) => element.props.text)
    .filter((text): text is string => typeof text === "string");
}

export function widgetStyles(node: Node): Record<string, unknown>[] {
  return flattenWidgetTree(node).map(
    (element) => (element.props.style ?? {}) as Record<string, unknown>,
  );
}

export function widgetClickUris(node: Node): string[] {
  return flattenWidgetTree(node)
    .filter((element) => element.props.clickAction === "OPEN_URI")
    .map((element) => (element.props.clickActionData as { uri: string }).uri);
}

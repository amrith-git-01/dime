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
  let element = node;
  while (
    typeof element.type === "function" &&
    !(element.type as { __name__?: string }).__name__
  ) {
    element = (element.type as (props: unknown) => ReactElement<Record<string, unknown>>)(
      element.props,
    );
  }
  return [element, ...flattenWidgetTree(element.props.children as Node)];
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

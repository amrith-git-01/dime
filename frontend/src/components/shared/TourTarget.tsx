import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";

import { useTourTarget } from "@/hooks/useTourTarget";

export type TourTargetProps = ViewProps & {
  id: string;
  children: ReactNode;
};

/** Wraps content so the guided app tour can spotlight it. Renders a plain `View`. */
export function TourTarget({ id, children, ...viewProps }: TourTargetProps) {
  const tour = useTourTarget(id);
  return (
    <View {...viewProps} {...tour}>
      {children}
    </View>
  );
}

export type OptionalTourTargetProps = {
  /** The target to claim; without one the children render as they are (no wrapper at all). */
  id: string | undefined;
  children: ReactNode;
};

/**
 * `<TourTarget>` for something only one item of a list should claim (its first row): the other
 * items pass no `id` and get no wrapper, so their layout is untouched.
 */
export function OptionalTourTarget({ id, children }: OptionalTourTargetProps) {
  return id === undefined ? <>{children}</> : <TourTarget id={id}>{children}</TourTarget>;
}

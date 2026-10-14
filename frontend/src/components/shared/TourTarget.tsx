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

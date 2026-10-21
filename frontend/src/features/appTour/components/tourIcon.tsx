import type { ComponentType } from "react";

import { DimeMark } from "@/components/brand/DimeMark";
import { useTheme } from "@/theme";

import type { TourIconSpec } from "../constants/tourIcons";

/** An icon component drawn like a lucide icon. */
export type TourIconComponent = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

/** The Dime mark, sized and coloured like a lucide icon: the icon of anything that is Dime Agent. */
export function DimeAgentIcon({ size = 24, color }: { size?: number; color?: string }) {
  const { colors } = useTheme();
  return <DimeMark size={size} color={color ?? colors.ink} />;
}

export function resolveTourIcon(spec: TourIconSpec): TourIconComponent {
  return spec === "dimeAgent" ? DimeAgentIcon : spec;
}

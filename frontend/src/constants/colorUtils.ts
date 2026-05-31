import { colors } from "./colors";

/** `#RRGGBB` or `RRGGBB` → `rgba(r,g,b,a)`. */
export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const bigint = Number.parseInt(normalized, 16);
  const red = (bigint >> 16) & 255;
  const green = (bigint >> 8) & 255;
  const blue = bigint & 255;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/** Appends 2-digit hex alpha suffix (e.g. `24` ≈ 14% on 6-digit hex). */
export function withHexAlphaSuffix(hex: string, alphaHex: string): string {
  const base = hex.startsWith("#") ? hex : `#${hex}`;
  return `${base}${alphaHex}`;
}

export function categoryMutedBackground(
  color: string | null | undefined,
): string {
  if (!color) {
    return colors.categoryDefaultMuted;
  }
  return withHexAlphaSuffix(color, "24");
}

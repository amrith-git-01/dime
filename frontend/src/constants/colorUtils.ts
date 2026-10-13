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

function parseHex(color: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color.trim());
  if (!match) {
    return null;
  }
  let digits = match[1];
  if (digits.length === 3) {
    digits = digits
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const value = Number.parseInt(digits.slice(0, 6), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * Applies an alpha to a `#rgb` / `#rrggbb` / `#rrggbbaa` color or replaces the alpha of an
 * `rgb(a)(...)` color. Unknown formats are returned unchanged, so it is safe on API-supplied
 * colors and does not depend on token format (unlike appending a hex suffix).
 */
export function withAlpha(color: string, alpha: number): string {
  const rgb = parseHex(color);
  if (rgb) {
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  }
  const match = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(color.trim());
  if (match) {
    return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
  }
  return color;
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a hex color, or null for formats we cannot parse. */
export function relativeLuminance(color: string): number | null {
  const rgb = parseHex(color);
  if (!rgb) {
    return null;
  }
  return (
    0.2126 * channelLuminance(rgb[0]) +
    0.7152 * channelLuminance(rgb[1]) +
    0.0722 * channelLuminance(rgb[2])
  );
}

/** WCAG contrast ratio between two hex colors (1 when either cannot be parsed). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la == null || lb == null) {
    return 1;
  }
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Minimum luminance for a category color to read as text/icon on a dark card (~4.5:1). */
const DARK_MIN_LUMINANCE = 0.25;

/**
 * Category colors are arbitrary API hex values. In dark mode a deep color (navy, forest) would
 * vanish on the card, so it is mixed toward white until it reads. Light mode and unparseable
 * colors are returned untouched.
 */
export function readableCategoryColor(
  color: string,
  scheme: "light" | "dark",
): string {
  if (scheme !== "dark") {
    return color;
  }
  const rgb = parseHex(color);
  if (!rgb) {
    return color;
  }
  const luminance = relativeLuminance(color);
  if (luminance == null || luminance >= DARK_MIN_LUMINANCE) {
    return color;
  }
  for (let mix = 0.1; mix <= 0.9; mix += 0.1) {
    const mixed = rgb.map((c) => Math.round(c + (255 - c) * mix)) as [
      number,
      number,
      number,
    ];
    const lum =
      0.2126 * channelLuminance(mixed[0]) +
      0.7152 * channelLuminance(mixed[1]) +
      0.0722 * channelLuminance(mixed[2]);
    if (lum >= DARK_MIN_LUMINANCE) {
      return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
    }
  }
  return "#FFFFFF";
}

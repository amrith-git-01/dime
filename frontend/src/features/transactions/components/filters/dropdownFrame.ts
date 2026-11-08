/** A chip's rectangle in window coordinates, which the dropdown hangs from. */
export type Anchor = { x: number; y: number; width: number; height: number };

const DROPDOWN_WIDTH = 300;
const DROPDOWN_MARGIN = 12;
const DROPDOWN_GAP = 6;

/**
 * Where the dropdown's own top-left corner sits in window coordinates. The chip is measured in the
 * app's window, but the dropdown is drawn in the Modal's window, and on Android the two do not
 * share an origin (window measurements start below the status bar; a `statusBarTranslucent`
 * Modal starts at the top of the screen). Measuring an empty probe at the Modal's corner in the
 * same coordinates gives the offset to subtract, whichever way the device reports it.
 */
export function dropdownFrame(
  anchor: Anchor,
  origin: { x: number; y: number },
  screen: { width: number; height: number },
): { top: number; left: number; width: number; maxHeight: number } {
  const width = Math.min(DROPDOWN_WIDTH, screen.width - DROPDOWN_MARGIN * 2);
  const left = Math.min(
    Math.max(anchor.x - origin.x, DROPDOWN_MARGIN),
    screen.width - width - DROPDOWN_MARGIN,
  );
  const top = anchor.y - origin.y + anchor.height + DROPDOWN_GAP;
  return { top, left, width, maxHeight: Math.max(160, screen.height - top - 24) };
}

/** A chip's rectangle in window coordinates, which the dropdown hangs from. */
export type Anchor = { x: number; y: number; width: number; height: number };

const DROPDOWN_WIDTH = 300;
const DROPDOWN_MARGIN = 12;
const DROPDOWN_GAP = 6;

/** Where the dropdown's top-left corner sits, hanging under the chip and kept on screen. */
export function dropdownFrame(
  anchor: Anchor,
  screen: { width: number; height: number },
): { top: number; left: number; width: number; maxHeight: number } {
  const width = Math.min(DROPDOWN_WIDTH, screen.width - DROPDOWN_MARGIN * 2);
  const left = Math.min(Math.max(anchor.x, DROPDOWN_MARGIN), screen.width - width - DROPDOWN_MARGIN);
  const top = anchor.y + anchor.height + DROPDOWN_GAP;
  return { top, left, width, maxHeight: Math.max(160, screen.height - top - 24) };
}

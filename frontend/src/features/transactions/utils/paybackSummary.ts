import { formatInrAmount } from "@/utils/currency";
import { toPaise } from "@/utils/paise";

/**
 * Money received that is linked to spends: the linked part is not income. What is left is income again, or, for a
 * refund (`payback`), it lowers spend in its own month. Nothing left: say so plainly instead of "₹0 counts".
 */
export function creditSummary(kind: string, linked: string, left: string): string {
  const head = `${formatInrAmount(linked)} pays back spends, so it isn't income`;
  if (toPaise(left) <= 0) return head;
  return kind === "payback"
    ? `${head} · the other ${formatInrAmount(left)} lowers your spend`
    : `${head} · the other ${formatInrAmount(left)} counts as income`;
}

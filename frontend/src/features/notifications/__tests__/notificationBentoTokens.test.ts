import { lightColors } from "@/theme/palettes";

import { getNotificationRowVisual } from "../notificationBentoTokens";
import type { NotificationKind } from "../types";

const KINDS: NotificationKind[] = [
  "transaction_auto",
  "budget_threshold",
  "capture_failed",
  "report_ready",
  "unknown",
];

describe("getNotificationRowVisual", () => {
  it.each(KINDS)("returns a complete visual for %s", (kind) => {
    const visual = getNotificationRowVisual(kind, lightColors);
    expect(visual.icon).toBeTruthy();
    expect(visual.backgroundColor).toEqual(expect.any(String));
    expect(visual.iconColor).toEqual(expect.any(String));
  });

  it("never throws or returns nothing for a kind that slipped past the types", () => {
    const visual = getNotificationRowVisual(
      "from_the_future" as NotificationKind,
      lightColors,
    );
    expect(visual.icon).toBeTruthy();
  });
});

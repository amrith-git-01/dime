import type { LimitsResponse } from "../../types";
import {
  formatLeft,
  formatResetsAt,
  getAgentAvailability,
  getCaptureAvailability,
} from "../limitsFormat";

// Local noon, so "same day" / "next day" checks are timezone independent.
const NOW = new Date(2026, 9, 10, 12, 0, 0);
const TOMORROW_5AM = new Date(2026, 9, 11, 5, 30, 0).toISOString();

function limits(overrides: Partial<LimitsResponse> = {}): LimitsResponse {
  return {
    resets_at: TOMORROW_5AM,
    agent_questions: { used: 2, limit: 5, remaining: 3 },
    receipt_scans: { used: 3, limit: 10, remaining: 7 },
    voice_captures: { used: 10, limit: 10, remaining: 0 },
    scanning_paused: false,
    ...overrides,
  };
}

describe("formatLeft", () => {
  it('reads "3 of 5 left"', () => {
    expect(formatLeft({ used: 2, limit: 5, remaining: 3 })).toBe("3 of 5 left");
  });

  it("never shows a negative count", () => {
    expect(formatLeft({ used: 6, limit: 5, remaining: -1 })).toBe(
      "0 of 5 left",
    );
  });
});

describe("formatResetsAt", () => {
  it("says tomorrow for a reset on the next local day", () => {
    expect(formatResetsAt(TOMORROW_5AM, NOW)).toBe("tomorrow at 5:30 AM");
  });

  it("says today for a reset later the same local day", () => {
    const later = new Date(2026, 9, 10, 23, 0, 0).toISOString();
    expect(formatResetsAt(later, NOW)).toBe("today at 11:00 PM");
  });

  it("falls back to tomorrow for an unreadable timestamp", () => {
    expect(formatResetsAt("not-a-date", NOW)).toBe("tomorrow");
  });
});

describe("getCaptureAvailability", () => {
  it("shows the remaining count and stays enabled", () => {
    const a = getCaptureAvailability("receipt", limits(), NOW);
    expect(a).toMatchObject({
      blocked: false,
      reason: null,
      badge: "7",
      caption: "7 scans left today",
      message: "",
    });
  });

  it("uses the singular for one left", () => {
    const a = getCaptureAvailability(
      "receipt",
      limits({ receipt_scans: { used: 9, limit: 10, remaining: 1 } }),
      NOW,
    );
    expect(a.caption).toBe("1 scan left today");
  });

  it("disables at zero with the reset time and a pointer to manual entry", () => {
    const a = getCaptureAvailability("voice", limits(), NOW);
    expect(a.blocked).toBe(true);
    expect(a.reason).toBe("limit");
    expect(a.badge).toBe("0");
    expect(a.message).toContain("tomorrow at 5:30 AM");
    expect(a.message).toContain("Manual entry is always free.");
  });

  it("disables both options while scanning is paused", () => {
    const paused = limits({ scanning_paused: true });
    for (const kind of ["receipt", "voice"] as const) {
      const a = getCaptureAvailability(kind, paused, NOW);
      expect(a.blocked).toBe(true);
      expect(a.reason).toBe("paused");
      expect(a.message).toContain("Manual entry is always free.");
    }
  });

  it("never blocks while limits are unknown", () => {
    expect(getCaptureAvailability("receipt", undefined, NOW)).toEqual({
      blocked: false,
      reason: null,
      badge: null,
      caption: "",
      message: "",
    });
  });
});

describe("getAgentAvailability", () => {
  it("captions the remaining questions", () => {
    expect(getAgentAvailability(limits(), NOW)).toEqual({
      exhausted: false,
      caption: "3 of 5 questions left today",
    });
  });

  it("marks the agent exhausted and says when it resets", () => {
    const a = getAgentAvailability(
      limits({ agent_questions: { used: 5, limit: 5, remaining: 0 } }),
      NOW,
    );
    expect(a.exhausted).toBe(true);
    expect(a.caption).toBe(
      "No questions left today. Resets tomorrow at 5:30 AM.",
    );
  });

  it("is quiet while unknown", () => {
    expect(getAgentAvailability(undefined, NOW)).toEqual({
      exhausted: false,
      caption: "",
    });
  });
});

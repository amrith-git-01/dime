/** `GET /api/v1/me/onboarding-progress`: what the user has done, computed from their data. */
export type OnboardingProgress = {
  first_expense: boolean;
  voice_or_scan: boolean;
  budget: boolean;
  recurring: boolean;
  asked_ai: boolean;
};

/** The three answers of the "What do you want from Dime?" step in profile setup. */
export type OnboardingGoal = "track" | "budget" | "save";

/** Rows of the Home "Get started" checklist. */
export type ChecklistItemId =
  | "firstExpense"
  | "voiceOrScan"
  | "budget"
  | "recurring"
  | "widget"
  | "askAi";

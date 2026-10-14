export const BUDGET_EDITOR_ROW_MIN_HEIGHT = 168;

/** Slider thumb snap — light overshoot, not stiff. */
export const BUDGET_SLIDER_SPRING = {
  damping: 16,
  stiffness: 210,
  mass: 0.85,
} as const;

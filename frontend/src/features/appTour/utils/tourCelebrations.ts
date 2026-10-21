/**
 * How a finished tab tour celebrates:
 * - `grand`: the last unseen tour was just finished: the big confetti (and the Tour master badge).
 * - `full`: the first time this tour was finished: the big confetti (when the day's allowance for
 *   it is not used up; then the lighter one).
 * - `medium`: any other finish, replays included: a smaller, shorter confetti that never uses up
 *   the day's big-confetti allowance.
 */
export type TourCelebration = "grand" | "full" | "medium";

export function pickTourCompletionCelebration(input: {
  replay: boolean;
  firstTime: boolean;
  allDone: boolean;
  celebratesFirstRun: boolean;
}): TourCelebration {
  if (input.replay) {
    return "medium";
  }
  if (input.allDone) {
    return "grand";
  }
  if (input.firstTime && input.celebratesFirstRun) {
    return "full";
  }
  return "medium";
}

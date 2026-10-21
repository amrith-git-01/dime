type TourCommand = () => void;

/**
 * Things a tour can do on the user's behalf ("Do it for me" on a Do step, for people who cannot
 * find or reach the target). The screen that owns the real action registers it under the step's
 * `action` name; it runs the same handler a tap would, so the same tour event follows.
 */
const commands = new Map<string, TourCommand>();

/** Registers a command; returns the unregister function (a no-op if another command took the name). */
export function registerTourCommand(
  name: string,
  command: TourCommand,
): () => void {
  commands.set(name, command);
  return () => {
    if (commands.get(name) === command) {
      commands.delete(name);
    }
  };
}

/** Runs a registered command; false when nothing is registered (the screen is not mounted). */
export function runTourCommand(name: string): boolean {
  const command = commands.get(name);
  if (!command) {
    return false;
  }
  command();
  return true;
}

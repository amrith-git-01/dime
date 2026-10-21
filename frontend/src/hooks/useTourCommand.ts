import { useEffect, useRef } from "react";

import { registerTourCommand } from "@/lib/tour/tourCommandRegistry";

/**
 * Lets the guided tour run `command` for the user while this screen is mounted:
 *
 *   useTourCommand("txPickDay", () => selectDay(someDay));
 *
 * The latest closure always runs, so the command can read current state without re-registering.
 */
export function useTourCommand(name: string, command: () => void): void {
  const latest = useRef(command);
  useEffect(() => {
    latest.current = command;
  });
  useEffect(
    () => registerTourCommand(name, () => latest.current()),
    [name],
  );
}

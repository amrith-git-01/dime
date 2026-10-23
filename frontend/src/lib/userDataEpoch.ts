/**
 * Counts the wipes of user data (sign-out, user switch). Work that started for one user checks
 * that the count is unchanged before it writes anything: a response that lands after the wipe
 * belongs to nobody. Requests tracked here are aborted by the wipe itself.
 */
let epoch = 0;
const inFlight = new Set<AbortController>();

export function currentUserDataEpoch(): number {
  return epoch;
}

/** Called by `wipeUserData`: invalidates everything started before it and cancels tracked requests. */
export function bumpUserDataEpoch(): void {
  epoch += 1;
  for (const controller of inFlight) {
    controller.abort();
  }
  inFlight.clear();
}

/** An AbortController the next wipe will abort; call the returned function when the request is done. */
export function trackAbortable(controller: AbortController): () => void {
  inFlight.add(controller);
  return () => {
    inFlight.delete(controller);
  };
}

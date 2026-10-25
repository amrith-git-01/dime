import { isAxiosError } from "axios";

import { SessionChangedError } from "@/lib/outbox/failure";

/**
 * Whether a failed settings save is worth sending again later: the server was never reached
 * (offline, DNS, timeout), or it said it is busy or broken (5xx, 408, 429). Any other answer (a
 * 4xx: rejected, or the session is gone) will not change by waiting.
 */
export function isTransientSaveError(error: unknown): boolean {
  if (isAxiosError(error)) {
    const status = error.response?.status;
    return status === undefined || status >= 500 || status === 408 || status === 429;
  }
  // The session changed under the request: nothing to retry for whoever is signed in now.
  return !(error instanceof SessionChangedError);
}

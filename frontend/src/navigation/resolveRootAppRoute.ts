export type RootAppRoute = "auth" | "bootstrapping" | "setup" | "main";

/** What the app knows about the signed-in user's profile, from `/me` or the copy kept on disk. */
export type ProfileKnowledge = "has-username" | "no-username" | "unknown";

/** Where the `/me` request stands: no answer yet, answered, or failed (no response, timeout, 401, 5xx). */
export type MeRequestState = "pending" | "success" | "failed";

/**
 * Which root screen to show.
 *
 * A signed-in user is never sent back to sign-in or to profile setup because of a failed
 * request: setup needs a profile that is known to have no username (from a successful `/me`,
 * now or earlier). With nothing known and `/me` failing (offline, a timeout), the app opens on
 * the main tabs and works from its persisted data; a later successful `/me` corrects the route.
 */
export function resolveRootAppRoute(input: {
  signedIn: boolean;
  profile: ProfileKnowledge;
  me: MeRequestState;
}): RootAppRoute {
  const { signedIn, profile, me } = input;
  if (!signedIn) {
    return "auth";
  }
  if (profile === "has-username") {
    return "main";
  }
  if (me === "pending") {
    return "bootstrapping";
  }
  return profile === "no-username" ? "setup" : "main";
}

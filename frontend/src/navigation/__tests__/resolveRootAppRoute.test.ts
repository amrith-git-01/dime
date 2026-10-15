import {
  resolveRootAppRoute,
  type MeRequestState,
  type ProfileKnowledge,
} from "../resolveRootAppRoute";

function route(
  overrides: Partial<{
    signedIn: boolean;
    welcomeTourCompleted: boolean;
    profile: ProfileKnowledge;
    me: MeRequestState;
  }>,
) {
  return resolveRootAppRoute({
    signedIn: true,
    welcomeTourCompleted: true,
    profile: "unknown",
    me: "pending",
    ...overrides,
  });
}

describe("resolveRootAppRoute", () => {
  describe("signed out", () => {
    it("shows the welcome tour until it was seen, then sign-in", () => {
      expect(route({ signedIn: false, welcomeTourCompleted: false })).toBe("welcome");
      expect(route({ signedIn: false, welcomeTourCompleted: true })).toBe("auth");
    });

    it("ignores anything the profile query says", () => {
      expect(route({ signedIn: false, profile: "has-username", me: "success" })).toBe("auth");
    });
  });

  describe("with a cached profile that has a username", () => {
    it.each<MeRequestState>(["pending", "success", "failed"])(
      "opens the main tabs straight away (/me %s)",
      (me) => {
        expect(route({ profile: "has-username", me })).toBe("main");
      },
    );
  });

  describe("/me succeeded", () => {
    it("opens the main tabs when the user has a username", () => {
      expect(route({ profile: "has-username", me: "success" })).toBe("main");
    });

    it("asks for profile setup when the username is empty", () => {
      expect(route({ profile: "no-username", me: "success" })).toBe("setup");
    });
  });

  describe("/me has not answered yet", () => {
    it("waits (the neutral loader) when nothing is known", () => {
      expect(route({ profile: "unknown", me: "pending" })).toBe("bootstrapping");
    });

    it("waits when the cached profile has no username yet", () => {
      expect(route({ profile: "no-username", me: "pending" })).toBe("bootstrapping");
    });
  });

  describe("/me failed", () => {
    it("opens the main tabs on a network error with no cached profile", () => {
      expect(route({ profile: "unknown", me: "failed" })).toBe("main");
    });

    it("opens the main tabs on a 401 with no cached profile (the auth layer signs out if the session is dead)", () => {
      expect(route({ profile: "unknown", me: "failed" })).toBe("main");
    });

    it("keeps a profile that is known to have no username on setup", () => {
      expect(route({ profile: "no-username", me: "failed" })).toBe("setup");
    });

    it("never sends a signed-in user to sign-in", () => {
      for (const profile of ["has-username", "no-username", "unknown"] as const) {
        for (const me of ["pending", "success", "failed"] as const) {
          expect(route({ profile, me })).not.toBe("auth");
          expect(route({ profile, me })).not.toBe("welcome");
        }
      }
    });
  });
});

import { dicebearAdventurerNeutralUrl } from "@/lib/avatar/dicebearAdventurerNeutralUrl";

import type { MeResponse } from "./types";

export type ProfileDisplay = {
  displayName: string;
  avatarUrl: string;
};

function displayNameFromEmail(email: string | null): string {
  if (!email) return "You";
  const at = email.indexOf("@");
  if (at <= 0) return email;
  return email.slice(0, at);
}

/** Resolve greeting label and avatar URL from a profile row (or session user id). */
export function resolveProfileDisplay(
  profile: MeResponse | null | undefined,
  fallbackUserId: string | null | undefined,
): ProfileDisplay {
  const username = profile?.username ?? null;
  const email = profile?.email ?? null;
  const avatarUrlFromDb =
    profile?.avatar_url?.trim() && profile.avatar_url.trim().length > 0
      ? profile.avatar_url.trim()
      : null;
  const userIdForDicebear = profile?.id ?? fallbackUserId ?? null;

  const trimmed = username?.trim();
  const displayName = trimmed
    ? trimmed
    : (() => {
        const fromEmail = displayNameFromEmail(email);
        return fromEmail.length > 0 ? fromEmail : "You";
      })();

  const avatarUrl = avatarUrlFromDb
    ? avatarUrlFromDb
    : dicebearAdventurerNeutralUrl(userIdForDicebear ?? "dime");

  return { displayName, avatarUrl };
}

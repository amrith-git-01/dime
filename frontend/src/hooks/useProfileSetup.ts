import { randomUUID } from "expo-crypto";
import { useCallback, useMemo, useState } from "react";

import { dicebearAdventurerNeutralUrl } from "@/lib/avatar/dicebearAdventurerNeutralUrl";

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

export type UsernameValidation = {
  message: string;
  isValid: boolean;
};

function validateUsername(raw: string): UsernameValidation {
  const value = raw.trim();
  if (value.length === 0) {
    return {
      message: "Enter 3–20 characters.",
      isValid: false,
    };
  }
  if (value.length < 3) {
    return { message: "At least 3 characters.", isValid: false };
  }
  if (value.length > 20) {
    return { message: "At most 20 characters.", isValid: false };
  }
  if (!USERNAME_REGEX.test(value)) {
    return {
      message: "No spaces or special characters.",
      isValid: false,
    };
  }
  return { message: "Looks good.", isValid: true };
}

export function useProfileSetup() {
  const [avatarSeed, setAvatarSeed] = useState(() => randomUUID());
  const [username, setUsername] = useState("");

  const validation = useMemo(() => validateUsername(username), [username]);

  const refreshAvatarSeed = useCallback(() => {
    setAvatarSeed(randomUUID());
  }, []);

  const avatarUrl = useMemo(
    () => dicebearAdventurerNeutralUrl(avatarSeed),
    [avatarSeed],
  );

  return {
    avatarUrl,
    refreshAvatarSeed,
    username,
    setUsername,
    validation,
  };
}

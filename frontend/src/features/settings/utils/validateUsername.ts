const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

export type UsernameValidation = {
  message: string;
  isValid: boolean;
};

export function validateUsername(raw: string): UsernameValidation {
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

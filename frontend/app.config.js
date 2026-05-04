/**
 * Merges static `app.json` with dynamic Android options.
 *
 * Google Play Protect often hard-blocks sideloaded APKs that declare SMS access
 * (READ_SMS / RECEIVE_SMS) with “financial fraud” messaging. For day-to-day dev
 * installs, omit those unless you explicitly opt in.
 *
 * Opt-in for a native rebuild: set EXPO_PUBLIC_INCLUDE_SENSITIVE_SMS=true in `.env`
 * (or your shell) before `expo prebuild` / `expo run:android` / EAS build.
 */
module.exports = ({ config }) => {
  const includeSensitiveSms =
    process.env.EXPO_PUBLIC_INCLUDE_SENSITIVE_SMS === "true" ||
    process.env.EXPO_PUBLIC_INCLUDE_SENSITIVE_SMS === "1";

  const previous = config.android?.permissions;
  const baseList = Array.isArray(previous) ? previous : [];
  const withoutSms = baseList.filter(
    (p) => p !== "READ_SMS" && p !== "RECEIVE_SMS",
  );

  const permissions = new Set(withoutSms);
  permissions.add("POST_NOTIFICATIONS");

  if (includeSensitiveSms) {
    permissions.add("READ_SMS");
    permissions.add("RECEIVE_SMS");
  }

  return {
    ...config,
    android: {
      ...config.android,
      permissions: Array.from(permissions),
    },
  };
};

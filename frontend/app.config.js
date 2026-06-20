/**
 * Merges static `app.json` with dynamic Android options.
 *
 * SMS permissions are injected via `plugins/withAndroidSmsPermissions.js` at prebuild.
 * Set EXPO_PUBLIC_INCLUDE_SENSITIVE_SMS=false only for Play Store builds that must omit SMS.
 */
module.exports = ({ config }) => {
  const includeSensitiveSms =
    process.env.EXPO_PUBLIC_INCLUDE_SENSITIVE_SMS !== "false" &&
    process.env.EXPO_PUBLIC_INCLUDE_SENSITIVE_SMS !== "0";

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

  const plugins = [...(config.plugins ?? [])];
  if (
    includeSensitiveSms &&
    !plugins.some(
      (entry) =>
        entry === "./plugins/withAndroidSmsPermissions.js" ||
        (Array.isArray(entry) &&
          entry[0] === "./plugins/withAndroidSmsPermissions.js"),
    )
  ) {
    plugins.push("./plugins/withAndroidSmsPermissions.js");
  }

  return {
    ...config,
    plugins,
    android: {
      ...config.android,
      permissions: Array.from(permissions),
    },
  };
};

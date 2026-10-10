/**
 * Merges static `app.json` with dynamic options.
 *
 * Cleartext (http://) traffic is DEV ONLY. Release builds talk HTTPS to the Cloudflare Worker, so
 * Android `usesCleartextTraffic` and iOS `NSAllowsLocalNetworking` are only enabled for development:
 *
 * - `APP_VARIANT=development`  -> allowed (set explicitly in the `development` EAS profile);
 * - any other `APP_VARIANT`    -> not allowed;
 * - no `APP_VARIANT`, building on EAS (`EAS_BUILD_PROFILE` set) -> allowed only for the `development` profile,
 *   so `preview` and `production` builds are HTTPS-only;
 * - no `APP_VARIANT`, not on EAS (`expo start`, local `expo prebuild`) -> allowed, so `wrangler dev` / a
 *   LAN backend keep working while developing.
 */
function allowsCleartextTraffic() {
  const variant = process.env.APP_VARIANT;
  if (variant) return variant === "development";
  const easProfile = process.env.EAS_BUILD_PROFILE;
  if (easProfile) return easProfile === "development";
  return true;
}

module.exports = ({ config }) => {
  const previous = config.android?.permissions;
  const baseList = Array.isArray(previous) ? previous : [];
  const permissions = new Set(
    baseList.filter((p) => p !== "RECEIVE_SMS" && p !== "READ_SMS"),
  );
  permissions.add("POST_NOTIFICATIONS");

  const cleartext = allowsCleartextTraffic();

  const ios = { ...config.ios };
  if (cleartext) {
    ios.infoPlist = {
      ...ios.infoPlist,
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
    };
  }

  return {
    ...config,
    ios,
    android: {
      ...config.android,
      // Backups would restore the encrypted stores without their Keystore keys.
      allowBackup: false,
      permissions: Array.from(permissions),
    },
    plugins: [
      ...(config.plugins ?? []),
      ...(cleartext
        ? [["expo-build-properties", { android: { usesCleartextTraffic: true } }]]
        : []),
    ],
  };
};

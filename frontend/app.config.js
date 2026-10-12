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
const fs = require("fs");
const path = require("path");

/** FCM v1: only wire google-services.json once the file exists (EAS file env var or local drop-in). */
function resolveGoogleServicesFile() {
  const fromEnv = process.env.GOOGLE_SERVICES_JSON;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  return fs.existsSync(path.join(__dirname, "google-services.json"))
    ? "./google-services.json"
    : undefined;
}

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
  const googleServicesFile = resolveGoogleServicesFile();

  const ios = { ...config.ios };
  if (cleartext) {
    ios.infoPlist = {
      ...ios.infoPlist,
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
    };
  }

  // Self-hosted OTA manifest endpoint (api/src/features/updates). Override to test against `wrangler dev`.
  const updatesUrl = process.env.EXPO_PUBLIC_UPDATES_URL || config.updates?.url;

  return {
    ...config,
    updates: { ...config.updates, url: updatesUrl },
    ios,
    android: {
      ...config.android,
      // Backups would restore the encrypted stores without their Keystore keys.
      allowBackup: false,
      ...(googleServicesFile ? { googleServicesFile } : {}),
      permissions: Array.from(permissions),
    },
    plugins: [
      ...(config.plugins ?? []),
      "./plugins/withReleaseSigning",
      ...(cleartext
        ? [["expo-build-properties", { android: { usesCleartextTraffic: true } }]]
        : []),
    ],
  };
};

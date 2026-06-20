const { AndroidConfig, withAndroidManifest } = require("@expo/config-plugins");

const SMS_PERMISSIONS = [
  "android.permission.READ_SMS",
  "android.permission.RECEIVE_SMS",
];

/**
 * Ensures SMS permissions are declared in the main Android manifest at prebuild.
 */
function withAndroidSmsPermissions(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    AndroidConfig.Manifest.ensurePermissions(manifest, SMS_PERMISSIONS);
    return config;
  });
}

module.exports = withAndroidSmsPermissions;

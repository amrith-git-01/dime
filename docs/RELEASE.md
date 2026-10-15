# Releasing Dime (no EAS)

Two paths. **Native APK** (new native code, permissions, SDK upgrades) is built locally. **OTA update** (JS and assets only) is published to our own Worker and picked up by installed apps on their next cold start.

## One-time setup

1. **Release keystore.** Download the existing EAS one: `cd frontend && npx eas-cli credentials` -> Android -> Keystore -> Download. Put it in `C:\Dime\keys\` (git-ignored).
2. **Gradle props.** Add to `~/.gradle/gradle.properties` (never the repo; env vars of the same names also work):
   ```
   DIME_UPLOAD_STORE_FILE=C:/Dime/keys/<keystore>.jks
   DIME_UPLOAD_STORE_PASSWORD=...
   DIME_UPLOAD_KEY_ALIAS=...
   DIME_UPLOAD_KEY_PASSWORD=...
   ```
   Unset = the release APK is debug-signed with a loud warning (do not share it).
3. **Google sign-in.** `cd frontend && npm run print:sha1`, then add that SHA-1 to the Google Cloud OAuth *Android* client for `com.amrith_01.frontend`.
4. **OTA signing keys** (already generated): private key `C:\Dime\keys\private-key.pem` (back it up; losing it means shipping a new APK with a new certificate), certificate `frontend/certs/certificate.pem` (committed, embedded in the APK; the app rejects unsigned or wrongly signed updates).
5. **Android toolchain** for `build:apk`: JDK 17 and the Android SDK (`ANDROID_HOME`, or `sdk.dir` in `frontend/android/local.properties`). `keytool` comes with the JDK. On Windows also install CMake 3.31.6 once (`sdkmanager "cmake;3.31.6"`): the default CMake 3.22 ninja fails on long native paths; `build:apk` points Gradle at 3.31.6.
6. `npx wrangler login` once (publishing uploads to the `dime-media` R2 bucket).

## Release a native APK

1. Bump `version` in `frontend/app.json`. It is the **runtime version** (`runtimeVersion: { policy: "appVersion" }`): an APK only receives updates published for its own version, so old APKs never get incompatible JS.
2. `cd frontend && npm run build:apk` (prebuild + `assembleRelease`, arm64-v8a + armeabi-v7a). It prints the APK path (`android/app/build/outputs/apk/release/app-release.apk`). Share it.

## Push an OTA fix

`cd frontend && npm run publish:update -- --message "what changed"`

Exports the JS, builds and signs the manifest with the private key, uploads assets, then flips the `latest` pointer last. `--dry-run` does everything except upload. `--channel` defaults to `production` (the app sends `expo-channel-name: production`). Update lands on the next cold start (it downloads in the background on one launch and runs on the following one).

The update is published for the `version` currently in `app.json`; it only reaches APKs built with that same version.

## Roll back

`npm run publish:update -- --rollback-to-embedded` sends apps back to the JS inside their APK. To undo a bad update with a good one, just publish a fixed update.

## OTA or new APK?

- **OTA:** screens, logic, styles, copy, images/fonts already in the bundle, API client changes.
- **New APK:** anything native: new/updated native packages, `app.json` plugins or permissions, Expo SDK / React Native upgrade, icons/splash, `google-services.json`. Bump `version`.
- **Native splash changes don't need a version bump.** The dark splash (soft-dark background, white wordmark `assets/images/splash-wordmark-dark.png`) is native config only and doesn't change the JS↔native interface, so it stays on runtime 1.0.0: JS ships by OTA now, and the next APK picks up the dark splash. Bump `version` only when a native module or the JS↔native interface changes (new native dependency, Expo SDK upgrade).
- **Backend:** deploys through CI on merge to `main` (`api/DEPLOY.md`); no app release needed.

The server side is `api/src/features/updates` (R2 layout in `storage.ts`). Dev builds never check for updates, but with code signing on, the dev client asks Metro for a signed development manifest: start Metro with `npm run start:dev` (passes `--private-key-path ../keys/private-key.pem`); plain `expo start --dev-client` fails with "Must specify --private-key-path".

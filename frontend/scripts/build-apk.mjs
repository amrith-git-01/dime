#!/usr/bin/env node
/**
 * Local release APK (no EAS): prebuild, then `gradlew assembleRelease` for arm64-v8a + armeabi-v7a.
 * Signing comes from the DIME_UPLOAD_* settings (see plugins/withReleaseSigning.js and docs/RELEASE.md).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { releaseSigningSettings } from "./release-env.mjs";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(frontendDir, "android");

function run(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: true });
  if (res.status !== 0) {
    console.error(`\n${cmd} ${args.join(" ")} failed (exit ${res.status}).`);
    process.exit(res.status ?? 1);
  }
}

const settings = releaseSigningSettings();
const storeFile = settings.DIME_UPLOAD_STORE_FILE;
if (!storeFile || !fs.existsSync(storeFile)) {
  console.warn("\n!!! DIME_UPLOAD_STORE_FILE is not set or the file is missing: the APK will be signed with the DEBUG key (docs/RELEASE.md).\n");
}

run("npx", ["expo", "prebuild", "--platform", "android", "--no-install"], frontendDir);
const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
run(gradlew, ["assembleRelease", "-PreactNativeArchitectures=arm64-v8a,armeabi-v7a"], androidDir);

const apk = path.join(androidDir, "app", "build", "outputs", "apk", "release", "app-release.apk");
console.log(fs.existsSync(apk) ? `\nAPK: ${apk}` : "\nBuild finished but app-release.apk was not found under android/app/build/outputs/apk/release.");

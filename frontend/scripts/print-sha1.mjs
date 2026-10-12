#!/usr/bin/env node
/** Prints the release key's SHA-1 / SHA-256 (for the Google Cloud OAuth Android client). */
import { spawnSync } from "node:child_process";
import fs from "node:fs";

import { releaseSigningSettings } from "./release-env.mjs";

const s = releaseSigningSettings();
if (!s.DIME_UPLOAD_STORE_FILE || !fs.existsSync(s.DIME_UPLOAD_STORE_FILE)) {
  console.error("DIME_UPLOAD_STORE_FILE is not set or the file is missing (docs/RELEASE.md).");
  process.exit(1);
}
const args = ["-list", "-v", "-keystore", s.DIME_UPLOAD_STORE_FILE, "-alias", s.DIME_UPLOAD_KEY_ALIAS, "-storepass", s.DIME_UPLOAD_STORE_PASSWORD];
const res = spawnSync("keytool", args, { encoding: "utf8" });
if (res.error || res.status !== 0) {
  console.error(res.error ? `keytool not found (install a JDK): ${res.error.message}` : res.stderr || res.stdout);
  process.exit(1);
}
console.log(res.stdout.split(/\r?\n/).filter((l) => /SHA1:|SHA256:|Alias name/.test(l)).join("\n"));

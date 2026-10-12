/** Reads the DIME_UPLOAD_* release-signing settings from env vars or ~/.gradle/gradle.properties (same order as the Gradle side). */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const KEYS = ["DIME_UPLOAD_STORE_FILE", "DIME_UPLOAD_STORE_PASSWORD", "DIME_UPLOAD_KEY_ALIAS", "DIME_UPLOAD_KEY_PASSWORD"];

function gradleProperties() {
  const file = path.join(process.env.GRADLE_USER_HOME || path.join(os.homedir(), ".gradle"), "gradle.properties");
  if (!fs.existsSync(file)) return {};
  const props = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_.]+)\s*[=:]\s*(.*?)\s*$/.exec(line);
    if (m && !line.trimStart().startsWith("#")) props[m[1]] = m[2];
  }
  return props;
}

export function releaseSigningSettings() {
  const props = gradleProperties();
  return Object.fromEntries(KEYS.map((k) => [k, process.env[k] || props[k] || ""]));
}

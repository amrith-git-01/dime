#!/usr/bin/env node
/**
 * Publish an over-the-air update to the self-hosted Expo Updates server (api/src/features/updates).
 *
 *   npm run publish:update -- --message "fix x"           export, sign, upload, switch `latest`
 *   npm run publish:update -- --dry-run                   export + build + verify the signature, upload nothing
 *   npm run publish:update -- --rollback-to-embedded      send installed apps back to the JS inside their APK
 *
 * Flags: --channel (production) --platform (android) --skip-export (reuse dist/) --message
 * Env:   DIME_UPDATES_PRIVATE_KEY  PEM private key (default ../keys/private-key.pem)
 *        DIME_R2_BUCKET            default dime-media
 *
 * Upload order: assets, manifest, signature, and `latest.json` LAST, so clients never see a half-published update.
 * Uploads use `wrangler r2 object put --remote` from api/ (needs `wrangler login`).
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import lib from "./updates-lib.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(here, "..");
const apiDir = path.resolve(frontendDir, "..", "api");
const distDir = path.join(frontendDir, "dist");
const certPath = path.join(frontendDir, "certs", "certificate.pem");

const { values: args } = parseArgs({
  options: {
    channel: { type: "string", default: "production" },
    platform: { type: "string", default: "android" },
    message: { type: "string", default: "" },
    "dry-run": { type: "boolean", default: false },
    "rollback-to-embedded": { type: "boolean", default: false },
    "skip-export": { type: "boolean", default: false },
  },
});

const dryRun = args["dry-run"];
const bucketName = process.env.DIME_R2_BUCKET || "dime-media";
const privateKeyPath = path.resolve(frontendDir, process.env.DIME_UPDATES_PRIVATE_KEY || "../keys/private-key.pem");

function run(cmd, cmdArgs, options = {}) {
  const res = spawnSync(cmd, cmdArgs, { stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit", encoding: "utf8", shell: true, ...options });
  if (res.status !== 0) throw new Error(`${cmd} ${cmdArgs.join(" ")} failed (exit ${res.status})`);
  return res.stdout;
}

function resolvedConfig() {
  // stdout may carry banner lines before the JSON; take from the first brace.
  const out = run("npx", ["expo", "config", "--type", "public", "--json"], { cwd: frontendDir, capture: true });
  return JSON.parse(out.slice(out.indexOf("{")));
}

function r2Put(key, file, contentType) {
  const cmdArgs = ["wrangler", "r2", "object", "put", `${bucketName}/${key}`, "--file", `"${file}"`, "--remote"];
  if (contentType) cmdArgs.push("--content-type", `"${contentType}"`);
  run("npx", cmdArgs, { cwd: apiDir });
}

/** Writes `text` to a temp file and uploads it. */
function r2PutText(key, text, contentType) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dime-ota-"));
  const file = path.join(dir, "payload");
  fs.writeFileSync(file, text);
  try {
    r2Put(key, file, contentType);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function assetExists(assetBaseUrl, hash) {
  try {
    const res = await fetch(`${assetBaseUrl}/${hash}`, { method: "HEAD" });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function main() {
  if (!fs.existsSync(privateKeyPath)) {
    throw new Error(`Private key not found at ${privateKeyPath}. Set DIME_UPDATES_PRIVATE_KEY (see docs/RELEASE.md).`);
  }
  const privateKey = fs.readFileSync(privateKeyPath, "utf8");
  const certificate = fs.readFileSync(certPath, "utf8");

  const config = resolvedConfig();
  const runtimeVersion = lib.resolveRuntimeVersion(config);
  const keyid = config.updates?.codeSigningMetadata?.keyid ?? "main";
  const manifestUrl = config.updates?.url;
  if (!manifestUrl?.endsWith("/manifest")) throw new Error(`updates.url should end in /manifest, got ${manifestUrl}`);
  const base = manifestUrl.slice(0, -"/manifest".length);
  const pointerKey = `updates/${args.channel}/${runtimeVersion}/${args.platform}/latest.json`;
  const id = randomUUID();
  console.log(`channel=${args.channel} platform=${args.platform} runtimeVersion=${runtimeVersion} id=${id}${dryRun ? " (dry run)" : ""}`);

  if (args["rollback-to-embedded"]) {
    const body = JSON.stringify(lib.buildRollbackDirective());
    const signature = lib.signBody(body, privateKey, keyid);
    if (!lib.verifySignature(body, signature, certificate)) throw new Error("Signature does not verify against frontend/certs/certificate.pem.");
    console.log("Signature verified against the committed certificate.");
    if (dryRun) return console.log("Dry run: nothing uploaded.");
    r2PutText(`updates/builds/${id}/directive.json`, body, "application/json");
    r2PutText(`updates/builds/${id}/signature`, signature, "text/plain");
    r2PutText(pointerKey, JSON.stringify({ type: "rollback", id }), "application/json");
    return console.log(`Published rollback to embedded (${id}). Apps pick it up on their next launch.`);
  }

  if (!args["skip-export"]) {
    fs.rmSync(distDir, { recursive: true, force: true });
    run("npx", ["expo", "export", "--platform", args.platform, "--output-dir", "dist"], { cwd: frontendDir });
  }

  const { manifest, files } = lib.buildManifest({
    distDir,
    platform: args.platform,
    runtimeVersion,
    assetBaseUrl: `${base}/assets`,
    expoConfig: config,
    id,
  });
  const body = JSON.stringify(manifest);
  const signature = lib.signBody(body, privateKey, keyid);
  if (!lib.verifySignature(body, signature, certificate)) throw new Error("Signature does not verify against frontend/certs/certificate.pem.");
  console.log(`Manifest built: ${manifest.assets.length} assets + launch bundle, ${files.length} unique files. Signature verified against the committed certificate.`);

  if (dryRun) return console.log("Dry run: nothing uploaded.");

  let uploaded = 0;
  for (const f of files) {
    if (await assetExists(`${base}/assets`, f.hash)) continue;
    r2Put(`updates/assets/${f.hash}`, f.filePath, f.contentType);
    uploaded += 1;
  }
  console.log(`Uploaded ${uploaded} new assets (${files.length - uploaded} already on the server).`);

  r2PutText(`updates/builds/${id}/manifest.json`, body, "application/json");
  r2PutText(`updates/builds/${id}/signature`, signature, "text/plain");
  r2PutText(`updates/builds/${id}/info.json`, JSON.stringify({ id, message: args.message, createdAt: manifest.createdAt, channel: args.channel, runtimeVersion }), "application/json");
  r2PutText(pointerKey, JSON.stringify({ type: "update", id }), "application/json"); // last: the atomic switch
  console.log(`Published ${id}${args.message ? ` ("${args.message}")` : ""}. Apps pick it up on their next cold start.`);
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});

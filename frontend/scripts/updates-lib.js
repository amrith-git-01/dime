/**
 * Pure helpers for `publish-update.mjs` (CommonJS so jest can test them): build an Expo Updates protocol v1
 * manifest from an `expo export` folder, sign it, and verify the signature.
 * Reference: https://docs.expo.dev/technical-specs/expo-updates-1/ and expo/custom-expo-updates-server.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const CONTENT_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ttf: "font/ttf",
  otf: "font/otf",
  json: "application/json",
  lottie: "application/json",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  mp4: "video/mp4",
  ico: "image/x-icon",
  bin: "application/octet-stream",
};

const SIGNATURE_ALG = "rsa-v1_5-sha256";

const contentTypeFor = (ext) => CONTENT_TYPES[String(ext).replace(/^\./, "").toLowerCase()] ?? "application/octet-stream";

const sha256Base64Url = (buf) => crypto.createHash("sha256").update(buf).digest("base64url");
const md5Hex = (buf) => crypto.createHash("md5").update(buf).digest("hex");

/** With `runtimeVersion: { policy: "appVersion" }` the runtime version is the app `version`. */
function resolveRuntimeVersion(config) {
  const rv = config.runtimeVersion;
  if (typeof rv === "string") return rv;
  if (rv && rv.policy === "appVersion" && config.version) return config.version;
  throw new Error("Unsupported runtimeVersion in app config (use a string or { policy: 'appVersion' }).");
}

/**
 * @param {object} o
 * @param {string} o.distDir        `expo export` output folder
 * @param {string} o.platform
 * @param {string} o.runtimeVersion
 * @param {string} o.assetBaseUrl   e.g. https://host/api/v1/updates/assets (no trailing slash)
 * @param {object} o.expoConfig     resolved public app config -> extra.expoClient
 * @param {string} [o.id]
 * @param {string} [o.createdAt]
 * @returns {{ manifest: object, files: { hash: string, filePath: string, contentType: string }[] }}
 */
function buildManifest({ distDir, platform, runtimeVersion, assetBaseUrl, expoConfig, id, createdAt }) {
  const metadata = JSON.parse(fs.readFileSync(path.join(distDir, "metadata.json"), "utf8"));
  const platformMeta = metadata.fileMetadata?.[platform];
  if (!platformMeta?.bundle) throw new Error(`dist/metadata.json has no ${platform} bundle. Did the export run?`);

  const files = [];
  const toAsset = (relPath, ext, contentType, isLaunch) => {
    const filePath = path.join(distDir, relPath);
    const buf = fs.readFileSync(filePath);
    const hash = sha256Base64Url(buf);
    files.push({ hash, filePath, contentType });
    return {
      hash,
      key: md5Hex(buf),
      contentType,
      // The launch asset's extension is ignored by clients and should be omitted.
      ...(isLaunch ? {} : { fileExtension: `.${String(ext).replace(/^\./, "")}` }),
      url: `${assetBaseUrl}/${hash}`,
    };
  };

  const launchAsset = toAsset(platformMeta.bundle, "", "application/javascript", true);
  const assets = (platformMeta.assets ?? []).map((a) => toAsset(a.path, a.ext, contentTypeFor(a.ext), false));

  const manifest = {
    id: id ?? crypto.randomUUID(),
    createdAt: createdAt ?? new Date().toISOString(),
    runtimeVersion,
    launchAsset,
    assets,
    metadata: {},
    extra: { expoClient: expoConfig },
  };
  return { manifest, files: dedupe(files) };
}

function dedupe(files) {
  const seen = new Map();
  for (const f of files) if (!seen.has(f.hash)) seen.set(f.hash, f);
  return [...seen.values()];
}

/** `expo-signature` header value for `body` (the exact bytes that will be served). */
function signBody(body, privateKeyPem, keyid = "main") {
  const sig = crypto.sign("RSA-SHA256", Buffer.from(body), privateKeyPem).toString("base64");
  return `sig="${sig}", keyid="${keyid}", alg="${SIGNATURE_ALG}"`;
}

/** Verifies a header made by `signBody` against the (self-signed) code signing certificate. */
function verifySignature(body, header, certificatePem) {
  const match = /(?:^|,\s*)sig="([^"]+)"/.exec(header);
  if (!match) return false;
  const publicKey = new crypto.X509Certificate(certificatePem).publicKey;
  return crypto.verify("RSA-SHA256", Buffer.from(body), publicKey, Buffer.from(match[1], "base64"));
}

/** Directive that sends clients back to the update embedded in their APK. */
function buildRollbackDirective(commitTime = new Date().toISOString()) {
  return { type: "rollBackToEmbedded", parameters: { commitTime } };
}

module.exports = {
  SIGNATURE_ALG,
  contentTypeFor,
  sha256Base64Url,
  md5Hex,
  resolveRuntimeVersion,
  buildManifest,
  signBody,
  verifySignature,
  buildRollbackDirective,
};

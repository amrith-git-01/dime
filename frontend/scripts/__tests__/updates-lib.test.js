const fs = require("fs");
const os = require("os");
const path = require("path");

const lib = require("../updates-lib");

const certPath = path.join(__dirname, "..", "..", "certs", "certificate.pem");
const keyPath = path.resolve(__dirname, "..", "..", "..", "keys", "private-key.pem");
const hasKey = fs.existsSync(keyPath);

function fakeDist() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dime-dist-"));
  fs.mkdirSync(path.join(dir, "assets"));
  fs.mkdirSync(path.join(dir, "_expo", "static", "js", "android"), { recursive: true });
  fs.writeFileSync(path.join(dir, "_expo/static/js/android/index-abc.hbc"), "bundle-bytes");
  fs.writeFileSync(path.join(dir, "assets/aaa"), "png-bytes");
  fs.writeFileSync(
    path.join(dir, "metadata.json"),
    JSON.stringify({
      version: 0,
      bundler: "metro",
      fileMetadata: { android: { bundle: "_expo/static/js/android/index-abc.hbc", assets: [{ path: "assets/aaa", ext: "png" }] } },
    }),
  );
  return dir;
}

describe("buildManifest", () => {
  it("follows the protocol v1 shape with sha256 base64url hashes and asset urls", () => {
    const dir = fakeDist();
    const { manifest, files } = lib.buildManifest({
      distDir: dir,
      platform: "android",
      runtimeVersion: "1.0.0",
      assetBaseUrl: "https://example.test/api/v1/updates/assets",
      expoConfig: { name: "Dime" },
    });
    expect(manifest.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(manifest.runtimeVersion).toBe("1.0.0");
    expect(manifest.metadata).toEqual({});
    expect(manifest.extra).toEqual({ expoClient: { name: "Dime" } });
    expect(manifest.launchAsset).toMatchObject({ contentType: "application/javascript" });
    expect(manifest.launchAsset.fileExtension).toBeUndefined();
    expect(manifest.launchAsset.hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(manifest.launchAsset.url).toBe(`https://example.test/api/v1/updates/assets/${manifest.launchAsset.hash}`);
    expect(manifest.assets).toEqual([
      expect.objectContaining({ contentType: "image/png", fileExtension: ".png", key: lib.md5Hex(Buffer.from("png-bytes")) }),
    ]);
    expect(files).toHaveLength(2);
  });

  it("resolves the appVersion runtime policy", () => {
    expect(lib.resolveRuntimeVersion({ version: "1.2.3", runtimeVersion: { policy: "appVersion" } })).toBe("1.2.3");
    expect(lib.resolveRuntimeVersion({ runtimeVersion: "abc" })).toBe("abc");
    expect(() => lib.resolveRuntimeVersion({ runtimeVersion: { policy: "fingerprint" } })).toThrow();
  });
});

// Needs the private key from C:\Dime\keys (never in git), so it only runs on the developer machine.
(hasKey ? describe : describe.skip)("signing with the committed certificate", () => {
  const cert = fs.readFileSync(certPath, "utf8");
  const key = hasKey ? fs.readFileSync(keyPath, "utf8") : "";

  it("signs the exact bytes and verifies against frontend/certs/certificate.pem", () => {
    const body = JSON.stringify({ id: "x", n: 1 });
    const header = lib.signBody(body, key, "main");
    expect(header).toMatch(/^sig="[A-Za-z0-9+/=]+", keyid="main", alg="rsa-v1_5-sha256"$/);
    expect(lib.verifySignature(body, header, cert)).toBe(true);
    expect(lib.verifySignature(body + " ", header, cert)).toBe(false);
    expect(lib.verifySignature(body, 'sig="AAAA"', cert)).toBe(false);
  });
});

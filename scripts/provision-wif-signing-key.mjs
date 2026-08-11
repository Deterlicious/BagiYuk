import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const jwksPath = process.argv[2];
if (!jwksPath) {
  throw new Error("Usage: node scripts/provision-wif-signing-key.mjs <jwks-output-path>");
}
if (existsSync(jwksPath)) {
  throw new Error(`Refusing to overwrite existing JWKS file: ${jwksPath}`);
}

const keyId = `bagiyuk-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2_048,
  publicExponent: 0x10001,
});
const privatePem = privateKey.export({ format: "pem", type: "pkcs8" });
const publicJwk = publicKey.export({ format: "jwk" });
const wrangler = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const secretResult = spawnSync(
  process.execPath,
  [wrangler, "secret", "put", "GOOGLE_WIF_PRIVATE_KEY", "--env", "production"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    input: privatePem,
    shell: false,
    windowsHide: true,
  },
);

if (secretResult.status !== 0) {
  process.stderr.write(secretResult.stderr || "Wrangler failed to store the WIF signing key.\n");
  process.exit(secretResult.status ?? 1);
}
process.stdout.write(secretResult.stdout);
writeFileSync(
  jwksPath,
  `${JSON.stringify({ keys: [{ ...publicJwk, alg: "RS256", kid: keyId, use: "sig" }] })}\n`,
  { encoding: "utf8", flag: "wx", mode: 0o600 },
);
console.log(JSON.stringify({ jwksPath, keyId, secretStored: true }));

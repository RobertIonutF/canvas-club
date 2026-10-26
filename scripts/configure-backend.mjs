import { readFileSync } from "node:fs";
import { generateKeyPairSync, createPublicKey } from "node:crypto";
import { spawnSync } from "node:child_process";
import { parse } from "dotenv";
import { resolve } from "node:path";
// Secrets remain in process memory and travel through stdin, never argv/output.
const args = process.argv.slice(2),
  prod = args.includes("--prod");
const site = args.includes("--site")
  ? args[args.indexOf("--site") + 1]
  : "http://localhost:3028";
const url = new URL(site);
if (!["https:", "http:"].includes(url.protocol))
  throw new Error("Invalid site URL");
const vars = parse(readFileSync(resolve(".env.local")));
if (!vars.OPENAI_API_KEY?.startsWith("sk-"))
  throw new Error("The approved local API credential is unavailable.");
const pkg = JSON.parse(
  readFileSync(resolve("node_modules/convex/package.json"), "utf8"),
);
const cli = resolve(
  "node_modules/convex",
  typeof pkg.bin === "string" ? pkg.bin : pkg.bin.convex,
);
function set(name, value) {
  const result = spawnSync(
    process.execPath,
    [cli, "env", "set", ...(prod ? ["--prod"] : []), name],
    { input: value, encoding: "utf8", timeout: 60000, windowsHide: true },
  );
  if (result.status !== 0)
    throw new Error(`Could not configure ${name}; no secret output retained.`);
  process.stdout.write(
    `Configured ${name} on ${prod ? "production" : "development"}.\n`,
  );
}
if (args.includes("--init-auth")) {
  const pair = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const jwk = createPublicKey(pair.publicKey).export({ format: "jwk" });
  set("JWT_PRIVATE_KEY", pair.privateKey);
  set("JWKS", JSON.stringify({ keys: [{ ...jwk, use: "sig", alg: "RS256" }] }));
}
set("SITE_URL", url.origin);
set("OPENAI_API_KEY", vars.OPENAI_API_KEY);
set("AI_DAILY_USER_LIMIT", "3");
set("AI_DAILY_GLOBAL_LIMIT", "30");
const calendar = spawnSync(
  process.execPath,
  [cli, "run", ...(prod ? ["--prod"] : []), "calendar:rollover", "{}"],
  { encoding: "utf8", windowsHide: true, timeout: 60000 },
);
if (calendar.status !== 0)
  throw new Error(
    "Backend credentials are configured, but the UTC calendar could not be initialized. Deploy current functions first, then rerun without --init-auth.",
  );
console.log(
  `Initialized the ${prod ? "production" : "development"} UTC calendar.`,
);

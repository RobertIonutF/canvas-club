import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
function bin(packageName, command) {
  const dir = resolve("node_modules", packageName),
    pkg = JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8"));
  return resolve(dir, typeof pkg.bin === "string" ? pkg.bin : pkg.bin[command]);
}
const production = process.env.VERCEL_ENV === "production";
if (production && !process.env.CONVEX_DEPLOY_KEY)
  throw new Error("Production backend deployment credential is missing.");
const args = production
  ? [
      bin("convex", "convex"),
      "deploy",
      "--typecheck",
      "enable",
      "--cmd",
      "npm run build",
      "--cmd-url-env-var-name",
      "NEXT_PUBLIC_CONVEX_URL",
    ]
  : [bin("next", "next"), "build"];
const result = spawnSync(process.execPath, args, {
  stdio: "inherit",
  env: process.env,
  windowsHide: true,
});
if (result.status !== 0) process.exit(result.status ?? 1);
if (production) {
  const calendar = spawnSync(
    process.execPath,
    [bin("convex", "convex"), "run", "calendar:rollover", "{}"],
    { stdio: "inherit", env: process.env, windowsHide: true },
  );
  process.exit(calendar.status ?? 1);
}

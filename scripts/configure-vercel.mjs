import { existsSync, readFileSync } from "node:fs";
import { delimiter, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parse } from "dotenv";
// Invoke through `npx --package vercel node scripts/configure-vercel.mjs`.
// The deployment token is read locally and passed through stdin, not tool output.
const vars = parse(readFileSync(".env.convex-production"));
if (!vars.CONVEX_DEPLOY_KEY?.startsWith("prod:"))
  throw new Error("A production-scoped deploy key is required.");
const dir = (process.env.PATH ?? "")
  .split(delimiter)
  .map((p) => resolve(p, "..", "vercel"))
  .find((p) => existsSync(resolve(p, "package.json")));
if (!dir)
  throw new Error("Run this helper with the Vercel package available on PATH.");
const pkg = JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8")),
  cli = resolve(dir, typeof pkg.bin === "string" ? pkg.bin : pkg.bin.vercel);
const result = spawnSync(
  process.execPath,
  [
    cli,
    "env",
    "add",
    "CONVEX_DEPLOY_KEY",
    "--environment",
    "production",
    "--sensitive",
    "--force",
    "--yes",
    "--project",
    "prj_TK2kmfBkeNYK2qGDsf3v6RdADrS1",
    "--scope",
    "robertionutfunduleas-projects",
  ],
  {
    input: vars.CONVEX_DEPLOY_KEY + "\n",
    encoding: "utf8",
    windowsHide: true,
    timeout: 60000,
  },
);
if (result.status !== 0)
  throw new Error(
    "Vercel production credential configuration failed; no secret output retained.",
  );
console.log(
  "Configured the production backend deploy credential as a Vercel Secret.",
);

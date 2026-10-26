import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

const production = process.env.QA_CONVEX_PROD === "true";
const deployment = production
  ? "https://impartial-ptarmigan-173.eu-west-1.convex.cloud"
  : "https://formal-gopher-359.eu-west-1.convex.cloud";
const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const http = new ConvexHttpClient(deployment),
  ref = (name) => makeFunctionReference(name);
const query = (name, args = {}) => http.query(ref(name), args),
  mutation = (name, args = {}) => http.mutation(ref(name), args),
  action = (name, args = {}) => http.action(ref(name), args);
function operator(name, args = {}) {
  const result = spawnSync(
    process.execPath,
    [
      resolve("node_modules/convex/bin/main.js"),
      "run",
      ...(production ? ["--prod"] : []),
      name,
      JSON.stringify(args),
    ],
    { encoding: "utf8", env: process.env },
  );
  if (result.status !== 0) throw new Error(`QA operator call failed: ${name}`);
  return JSON.parse(result.stdout.trim());
}
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};
let userId, failure, cleanup;
const checks = [];
try {
  const signed = await action("auth:signIn", {
    provider: "password",
    params: {
      flow: "signUp",
      email: `canvas-qa-${runId}-0@example.invalid`,
      password: randomBytes(32).toString("base64url"),
    },
  });
  assert(signed.tokens?.token, "QA authentication failed.");
  http.setAuth(signed.tokens.token);
  userId = (await mutation("users:ensureProfile")).userId;
  const [prompts, usage, me] = await Promise.all([
    query("challenges:list"),
    query("quota:usage"),
    query("users:me"),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  assert(
    prompts.some((p) => p.id.startsWith(`daily:${today}:`)) &&
      usage.day === today &&
      me.userId === userId &&
      me.completedThisWeek === 0,
    "Seeded calendar query smoke failed.",
  );
  checks.push({
    name: "seeded prompts, quota day and weekly profile queries",
    passed: true,
  });
  const projectId = await mutation("projects:create", {
    title: "QA storage boundary",
    width: 64,
    height: 64,
  });
  const snapshot = await action("files:upload", {
    kind: "snapshot",
    data: new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        width: 64,
        height: 64,
        layers: [],
        qaRun: runId,
      }),
    ).buffer,
  });
  const raw = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY9sAAAAASUVORK5CYII=",
    "base64",
  );
  const preview = await action("files:upload", {
    kind: "preview",
    data: raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
  });
  await mutation("projects:save", {
    projectId,
    snapshotStorageId: snapshot.storageId,
    previewStorageId: preview.storageId,
    medium: "manual",
    expectedVersion: 0,
  });
  const before = await query("quota:usage");
  const result = operator("testing:storageBoundaryQa", {
    userId,
    projectId,
    previewStorageId: preview.storageId,
  });
  assert(
    result.preflightDenied,
    "Storage preflight did not reject the metadata fixture.",
  );
  checks.push({
    name: "full registered storage denies AI before provider/quota reservation",
    passed: true,
  });
  assert(
    result.finishDenied,
    "Storage completion did not detect concurrent capacity change.",
  );
  checks.push({
    name: "completion transaction rechecks registered capacity",
    passed: true,
  });
  const after = await query("quota:usage");
  assert(
    after.used === before.used + 1 && after.remaining === before.remaining - 1,
    "Preflight consumed quota or completion silently refunded the reserved attempt.",
  );
  checks.push({
    name: "preflight consumes no allowance and failed completion retains its single reservation",
    passed: true,
  });
  const original = await query("projects:get", { projectId });
  assert(
    result.originalPreserved &&
      original.version === 1 &&
      (await fetch(original.imageUrl)).ok &&
      (await fetch(original.snapshotUrl)).ok,
    "Storage denial changed or deleted the original project.",
  );
  assert(result.paidImageCalls === 0, "Fixture used an image provider.");
  checks.push({
    name: "original project survives both boundaries with no provider call",
    passed: true,
  });
} catch (error) {
  failure =
    error instanceof Error
      ? error.message
      : "Storage boundary verification failed.";
  process.exitCode = 1;
} finally {
  if (userId) cleanup = operator("testing:cleanup", { userIds: [userId] });
  const report = {
    passed: !failure,
    failure: failure ?? null,
    deployment,
    production,
    runId,
    checks,
    cleanup,
    paidImageCalls: 0,
  };
  await mkdir(".frontend-craft", { recursive: true });
  await writeFile(
    `.frontend-craft/storage-boundary-${production ? "production" : "development"}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
}

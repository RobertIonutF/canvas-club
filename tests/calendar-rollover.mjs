import { ConvexClient, ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

// Explicitly DEV-only: this test briefly advances the materialized row to
// yesterday, watches existing WebSocket subscriptions update, then restores it.
const deployment = "https://formal-gopher-359.eu-west-1.convex.cloud";
const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const http = new ConvexHttpClient(deployment);
const ref = (name) => makeFunctionReference(name);
const query = (name, args = {}) => http.query(ref(name), args);
const mutation = (name, args = {}) => http.mutation(ref(name), args);
const action = (name, args = {}) => http.action(ref(name), args);
function operator(name, args = {}) {
  const result = spawnSync(
    process.execPath,
    [
      resolve("node_modules/convex/bin/main.js"),
      "run",
      name,
      JSON.stringify(args),
    ],
    { encoding: "utf8", env: process.env },
  );
  if (result.status !== 0)
    throw new Error(`Calendar QA operator call failed: ${name}`);
  return JSON.parse(result.stdout.trim());
}
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};
const values = {};
const waiters = [];
let socket;
let userId;
let failure;
let cleanup;
const checks = [];
function receive(name, value) {
  values[name] = value;
  for (const check of [...waiters]) check();
}
function waitFor(predicate, label) {
  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) {
        clearTimeout(timer);
        waiters.splice(waiters.indexOf(check), 1);
        resolve();
      }
    };
    const timer = setTimeout(() => {
      waiters.splice(waiters.indexOf(check), 1);
      reject(new Error(`Subscription did not update: ${label}`));
    }, 10000);
    waiters.push(check);
    check();
  });
}
const dailyDay = () =>
  values.prompts?.find((p) => p.kind === "daily")?.id.split(":")[1];
try {
  const initial = operator("calendar:rollover");
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
  const projectId = await mutation("projects:create", {
    title: "UTC calendar QA fixture",
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
  const prompts = await query("challenges:list");
  await mutation("challenges:complete", {
    projectId,
    challengeId: prompts[0].id,
  });
  socket = new ConvexClient(deployment);
  socket.setAuth(async () => signed.tokens.token);
  socket.onUpdate(ref("challenges:list"), {}, (value) =>
    receive("prompts", value),
  );
  socket.onUpdate(ref("quota:usage"), {}, (value) => receive("quota", value));
  socket.onUpdate(ref("users:me"), {}, (value) => receive("me", value));
  await waitFor(
    () =>
      dailyDay() === initial.day &&
      values.quota?.day === initial.day &&
      values.me?.completedThisWeek === 1,
    "initial current UTC data",
  );
  checks.push({
    name: "existing authenticated subscriptions show current prompt, allowance day and weekly completion",
    passed: true,
  });
  const previous = operator("calendar:previousDayForQa");
  await waitFor(
    () =>
      dailyDay() === previous.day &&
      values.quota?.day === previous.day &&
      values.me?.completedThisWeek === (previous.week === initial.week ? 1 : 0),
    "previous-day row invalidates existing cached queries",
  );
  assert(
    values.quota.resetsAt ===
      new Date(previous.startAt + 86400000).toISOString(),
    "Quota reset time did not follow the calendar row.",
  );
  checks.push({
    name: "calendar row change invalidates existing prompt, quota and weekly-progress subscriptions",
    passed: true,
  });
  const restored = operator("calendar:rollover");
  await waitFor(
    () =>
      dailyDay() === restored.day &&
      values.quota?.day === restored.day &&
      values.me?.completedThisWeek === 1,
    "restored current UTC data",
  );
  checks.push({
    name: "normal rollover restores current UTC views without changing counters",
    passed: true,
  });
  assert(
    operator("calendar:rollover").changed === false,
    "Same-day rollover changed the singleton.",
  );
  checks.push({ name: "same-day rollover is a no-op", passed: true });
} catch (error) {
  failure =
    error instanceof Error ? error.message : "Calendar regression failed.";
  process.exitCode = 1;
} finally {
  const restored = operator("calendar:rollover");
  if (socket) await socket.close();
  if (userId) cleanup = operator("testing:cleanup", { userIds: [userId] });
  const report = {
    passed: !failure,
    failure: failure ?? null,
    checks,
    deployment,
    runId,
    restoredDay: restored.day,
    restoredWeek: restored.week,
    cleanup,
    paidImageCalls: 0,
    productionClockModified: false,
  };
  await mkdir(".frontend-craft", { recursive: true });
  await writeFile(
    ".frontend-craft/calendar-rollover-results.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
}

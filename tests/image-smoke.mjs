import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { randomBytes, createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { parse } from "dotenv";
const env = parse(readFileSync(".env.local"));
const url = process.env.QA_CONVEX_URL ?? env.NEXT_PUBLIC_CONVEX_URL;
const client = new ConvexHttpClient(url),
  ref = makeFunctionReference;
const email = `canvas-qa-${randomBytes(6).toString("hex")}-0@example.invalid`,
  password = randomBytes(24).toString("base64url");
const results = [];
let userId, generatedId;
async function upload(kind, bytes) {
  const data = Buffer.from(bytes),
    grant = await client.mutation(ref("files:createUpload"), {
      kind,
      sha256: createHash("sha256").update(data).digest("hex"),
      size: data.length,
    });
  const response = await fetch(grant.uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": kind === "snapshot" ? "application/json" : "image/png",
    },
    body: data,
  });
  if (!response.ok) throw new Error("QA upload failed");
  const { storageId } = await response.json();
  await client.action(ref("files:commitUpload"), {
    grantId: grant.grantId,
    storageId,
  });
  return storageId;
}
try {
  const signed = await client.action(ref("auth:signIn"), {
    provider: "password",
    params: { email, password, flow: "signUp" },
  });
  if (!signed.tokens?.token) throw new Error("QA authentication failed");
  client.setAuth(signed.tokens.token);
  userId = (await client.query(ref("users:me"), {})).userId;
  await client.mutation(ref("users:ensureProfile"), {});
  const projectId = await client.mutation(ref("projects:create"), {
    title: "QA image integration",
    width: 1024,
    height: 1024,
  });
  const generated = await client.action(ref("images:request"), {
    projectId,
    operation: "generate",
    style: "gouache",
    prompt:
      "An original small houseplant with three round green leaves in a terracotta pot, simple flat shapes on a warm cream background. No lettering.",
  });
  const png = Buffer.from(
    await (await fetch(generated.imageUrl)).arrayBuffer(),
  );
  if (
    png.length < 1000 ||
    png.readUInt32BE(16) !== 1024 ||
    png.readUInt32BE(20) !== 1024
  )
    throw new Error("Generated output was not a 1024 PNG");
  results.push({
    name: "live OpenAI generation returns owned 1024 PNG",
    passed: true,
    bytes: png.length,
  });
  console.log("PASS live OpenAI generation");
  const document = {
    version: 1,
    width: 1024,
    height: 1024,
    background: "#fffdf7",
    activeLayerId: "qa-layer",
    layers: [
      {
        id: "qa-layer",
        name: "AI starter",
        visible: true,
        opacity: 1,
        dataUrl: `data:image/png;base64,${png.toString("base64")}`,
      },
    ],
  };
  const snapshotStorageId = await upload(
      "snapshot",
      Buffer.from(JSON.stringify(document)),
    ),
    previewStorageId = await upload("preview", png);
  await client.mutation(ref("projects:save"), {
    projectId,
    title: "QA image integration",
    snapshotStorageId,
    previewStorageId,
    medium: "generated",
    expectedVersion: 0,
  });
  const edited = await client.action(ref("images:request"), {
    projectId,
    operation: "edit",
    style: "natural",
    prompt:
      "Keep the plant, pot, background and arrangement. Add one tiny coral-colored flower next to the plant. No lettering.",
  });
  const editPng = Buffer.from(
    await (await fetch(edited.imageUrl)).arrayBuffer(),
  );
  if (editPng.length < 1000 || editPng.readUInt32BE(16) !== 1024)
    throw new Error("Edited output was not a valid 1024 PNG");
  const after = await client.query(ref("projects:get"), { projectId });
  if (after.previewStorageId !== previewStorageId || after.version !== 1)
    throw new Error("AI unexpectedly replaced the artist's project");
  results.push({
    name: "live OpenAI edit preserves saved original until accepted",
    passed: true,
    bytes: editPng.length,
  });
  console.log("PASS live OpenAI edit and original preservation");
  generatedId = generated.jobId;
} catch (error) {
  results.push({
    name: "live OpenAI request",
    passed: false,
    message:
      typeof error?.data === "string"
        ? error.data
        : "Live image verification could not finish. See server-safe request metadata.",
  });
  process.exitCode = 1;
} finally {
  mkdirSync(".frontend-craft", { recursive: true });
  const cleanup = userId ? { userIds: [userId] } : null;
  writeFileSync(
    ".frontend-craft/image-smoke-results.json",
    JSON.stringify(
      {
        deployment: url,
        results,
        cleanupRequired: !!cleanup,
        cleanup,
        generatedJobId: generatedId,
      },
      null,
      2,
    ),
  );
  if (cleanup) {
    const pkg = JSON.parse(
        readFileSync("node_modules/convex/package.json", "utf8"),
      ),
      bin = `node_modules/convex/${typeof pkg.bin === "string" ? pkg.bin : pkg.bin.convex}`;
    const result = spawnSync(
      process.execPath,
      [
        bin,
        "run",
        ...(process.env.QA_PROD === "1" ? ["--prod"] : []),
        "testing:cleanup",
        JSON.stringify(cleanup),
      ],
      { encoding: "utf8", windowsHide: true, timeout: 60000 },
    );
    if (result.status === 0) {
      writeFileSync(
        ".frontend-craft/image-smoke-results.json",
        JSON.stringify(
          { deployment: url, results, cleanupRequired: false },
          null,
          2,
        ),
      );
      console.log("QA image account and content removed.");
    } else
      console.log(
        "QA cleanup requires follow-up; identifiers saved in ignored evidence file.",
      );
  }
}

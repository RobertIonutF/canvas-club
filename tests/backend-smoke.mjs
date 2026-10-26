import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// This integration smoke test creates two clearly marked, temporary QA accounts.
// It never calls an image model. Tokens and random passwords stay in memory.
const deployment =
  process.env.QA_CONVEX_URL ??
  "https://formal-gopher-359.eu-west-1.convex.cloud";
const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const clients = [
  new ConvexHttpClient(deployment),
  new ConvexHttpClient(deployment),
];
const anonymous = new ConvexHttpClient(deployment);
const ids = [];
const results = [];
const projectIds = [];
const uploadedStorageIds = [];
const credentials = [];
const ref = (name) => makeFunctionReference(name);
const query = (c, n, a = {}) => c.query(ref(n), a);
const mutate = (c, n, a = {}) => c.mutation(ref(n), a);
const action = (c, n, a = {}) => c.action(ref(n), a);
function operator(name, args) {
  if (!name.startsWith("testing:"))
    throw new Error("Only bounded QA maintenance is supported.");
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
  if (result.status !== 0) throw new Error(`Operator QA check failed: ${name}`);
  return JSON.parse(result.stdout.trim());
}
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};
async function check(name, fn) {
  await fn();
  results.push({ name, passed: true });
  console.log(`PASS ${name}`);
}
async function rejects(fn) {
  let denied = false;
  try {
    await fn();
  } catch {
    denied = true;
  }
  assert(denied, "Expected an authorization/validation rejection.");
}
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY9sAAAAASUVORK5CYII=",
  "base64",
);
async function upload(c, kind, data) {
  const sha256 = createHash("sha256").update(data).digest("hex");
  const grant = await mutate(c, "files:createUpload", {
    kind,
    sha256,
    size: data.length,
  });
  const response = await fetch(grant.uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": kind === "snapshot" ? "application/json" : "image/png",
    },
    body: data,
  });
  assert(response.ok, "File upload did not succeed.");
  const { storageId } = await response.json();
  uploadedStorageIds.push(storageId);
  await action(c, "files:commitUpload", { grantId: grant.grantId, storageId });
  return { storageId, grantId: grant.grantId };
}
let failure;
try {
  await check("anonymous profile is null", async () =>
    assert(
      (await query(anonymous, "users:me")) === null,
      "Anonymous profile leaked.",
    ),
  );
  for (const [i, c] of clients.entries()) {
    const email = `canvas-qa-${runId}-${i}@example.invalid`;
    const password = randomBytes(32).toString("base64url");
    const signed = await action(c, "auth:signIn", {
      provider: "password",
      params: {
        flow: "signUp",
        email,
        password,
      },
    });
    assert(signed.tokens?.token, "Password signup did not issue a token.");
    credentials.push({
      email,
      password,
      refreshToken: signed.tokens.refreshToken,
    });
    c.setAuth(signed.tokens.token);
    const profile = await mutate(c, "users:ensureProfile");
    ids.push(profile.userId);
    await mutate(c, "users:update", {
      displayName: `Canvas Club QA ${runId} ${i}`,
      handle: `qa-${runId}-${i}`,
      bio: "Temporary automated verification account; removed after testing.",
    });
  }
  const [a, b] = clients;
  const pa = await mutate(a, "projects:create", {
    title: `QA ${runId} private sketch`,
    width: 64,
    height: 64,
  });
  projectIds.push(pa);
  const pb = await mutate(b, "projects:create", {
    title: `QA ${runId} second account`,
    width: 64,
    height: 64,
  });
  projectIds.push(pb);
  await check("private projects require their owner", async () => {
    await rejects(() => query(b, "projects:get", { projectId: pa }));
    await rejects(() => query(anonymous, "projects:get", { projectId: pa }));
  });
  const snapshot = await upload(
    a,
    "snapshot",
    Buffer.from(
      JSON.stringify({
        version: 1,
        width: 64,
        height: 64,
        layers: [],
        qaRun: runId,
      }),
    ),
  );
  const preview = await upload(a, "preview", png);
  await check(
    "direct upload grants enforce digest and one-use registration",
    async () => {
      await rejects(() =>
        action(a, "files:commitUpload", {
          grantId: snapshot.grantId,
          storageId: snapshot.storageId,
        }),
      );
      const wrong = await mutate(b, "files:createUpload", {
        kind: "preview",
        sha256: "0".repeat(64),
        size: png.length,
      });
      const badUpload = await fetch(wrong.uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: png,
      });
      assert(
        badUpload.ok,
        "QA negative digest upload failed before validation.",
      );
      const badFile = await badUpload.json();
      uploadedStorageIds.push(badFile.storageId);
      await rejects(() =>
        action(b, "files:commitUpload", {
          grantId: wrong.grantId,
          storageId: badFile.storageId,
        }),
      );
      await rejects(() =>
        action(b, "files:commitUpload", {
          grantId: wrong.grantId,
          storageId: preview.storageId,
        }),
      );
      await rejects(() =>
        query(b, "files:getUrl", { storageId: snapshot.storageId }),
      );
    },
  );
  const saveArgs = {
    projectId: pa,
    snapshotStorageId: snapshot.storageId,
    previewStorageId: preview.storageId,
    medium: "manual",
    expectedVersion: 0,
  };
  await check("save validates owner and file ownership", async () => {
    await rejects(() => mutate(b, "projects:save", saveArgs));
    await rejects(() =>
      mutate(b, "projects:save", { ...saveArgs, projectId: pb }),
    );
    const saved = await mutate(a, "projects:save", saveArgs);
    assert(saved.version === 1, "Version not incremented.");
  });
  await check("stale writes fail and revisions restore safely", async () => {
    await rejects(() => mutate(a, "projects:save", saveArgs));
    const saved = await mutate(a, "projects:save", {
      ...saveArgs,
      title: `QA ${runId} updated`,
      expectedVersion: 1,
    });
    assert(saved.version === 2, "Second save failed.");
    const revisions = await query(a, "projects:revisions", { projectId: pa });
    assert(revisions.length === 2, "Expected two revisions.");
    await rejects(() =>
      mutate(b, "projects:restoreRevision", {
        projectId: pa,
        revisionId: revisions[1]._id,
        expectedVersion: 2,
      }),
    );
    const restored = await mutate(a, "projects:restoreRevision", {
      projectId: pa,
      revisionId: revisions[1]._id,
      expectedVersion: 2,
    });
    assert(restored.version === 3, "Restore version did not advance.");
  });
  let artworkId;
  let publicUrl;
  await check("publishing exposes only a separate public preview", async () => {
    ({ artworkId } = await action(a, "projects:setVisibility", {
      projectId: pa,
      visibility: "public",
    }));
    const art = await query(b, "community:getArtwork", { artworkId });
    assert(art?.imageUrl, "Public preview missing.");
    publicUrl = art.imageUrl;
    for (const field of [
      "projectId",
      "snapshotStorageId",
      "previewStorageId",
      "snapshotUrl",
      "userId",
    ])
      assert(!(field in art), `Private field leaked: ${field}`);
    const own = await query(a, "projects:get", { projectId: pa });
    assert(
      own.snapshotUrl && own.imageUrl !== publicUrl,
      "Public preview reused private original.",
    );
    assert((await fetch(publicUrl)).ok, "Public preview did not load.");
  });
  await check("real likes and comments persist between accounts", async () => {
    const liked = await mutate(b, "community:like", { artworkId });
    assert(liked.liked && liked.likesCount === 1, "Like did not persist.");
    const unliked = await mutate(b, "community:like", { artworkId });
    assert(
      !unliked.liked && unliked.likesCount === 0,
      "Unlike did not persist.",
    );
    await mutate(b, "community:comment", {
      artworkId,
      body: `QA ${runId}: I like the gentle colors.`,
    });
    const comments = await query(a, "community:listComments", {
      artworkId,
      paginationOpts: { numItems: 20, cursor: null },
    });
    assert(
      comments.page.some((c) => c.author.userId === ids[1]),
      "Comment not visible to owner.",
    );
  });
  await check(
    "reports save and blocking hides artwork bidirectionally",
    async () => {
      assert(
        (
          await mutate(b, "community:report", {
            artworkId,
            reason: "Temporary QA report for verification.",
          })
        ).ok,
        "Report failed.",
      );
      await mutate(a, "community:block", { userId: ids[1] });
      assert(
        (await query(b, "community:getArtwork", { artworkId })) === null,
        "Blocked viewer still sees artwork.",
      );
      const blocked = await query(a, "community:blockedUsers");
      assert(
        blocked.some((p) => p.userId === ids[1]),
        "Block not persisted.",
      );
      await rejects(() =>
        mutate(b, "community:comment", {
          artworkId,
          body: "This should be blocked.",
        }),
      );
      await mutate(a, "community:unblock", { userId: ids[1] });
      assert(
        await query(b, "community:getArtwork", { artworkId }),
        "Unblock did not restore visibility.",
      );
    },
  );
  await check("XP completion is idempotent and project-bound", async () => {
    const challenges = await query(a, "challenges:list");
    assert(challenges.length > 1, "Challenges missing.");
    const first = await mutate(a, "challenges:complete", {
      projectId: pa,
      challengeId: challenges[0].id,
    });
    assert(first.xpAwarded === 100, "Completion XP missing.");
    const duplicate = await mutate(a, "challenges:complete", {
      projectId: pa,
      challengeId: challenges[0].id,
    });
    assert(
      duplicate.xpAwarded === 0 && duplicate.alreadyCompleted,
      "Repeated completion awarded XP.",
    );
    await rejects(() =>
      mutate(a, "challenges:complete", {
        projectId: pa,
        challengeId: challenges[1].id,
      }),
    );
    await rejects(() =>
      mutate(b, "challenges:complete", {
        projectId: pa,
        challengeId: challenges[0].id,
      }),
    );
  });
  await check(
    "internal quota and QA maintenance are not public APIs",
    async () => {
      await rejects(() =>
        mutate(a, "quota:reserve", {
          userId: ids[0],
          projectId: pa,
          operation: "generate",
        }),
      );
      await rejects(() => mutate(a, "testing:cleanup", { userIds: ids }));
      const usage = await query(a, "quota:usage");
      assert(
        usage.used === 0 && usage.remaining === 3,
        "Unexpected AI allowance before any model use.",
      );
    },
  );
  await check(
    "unpublishing revokes the public copy and preserves private originals",
    async () => {
      await action(a, "projects:setVisibility", {
        projectId: pa,
        visibility: "private",
      });
      assert(
        (await query(b, "community:getArtwork", { artworkId })) === null,
        "Unpublished work still discoverable.",
      );
      assert(
        !(await fetch(publicUrl, { cache: "no-store" })).ok,
        "Deleted public preview remains fetchable.",
      );
      const own = await query(a, "projects:get", { projectId: pa });
      assert(
        (await fetch(own.snapshotUrl)).ok && (await fetch(own.imageUrl)).ok,
        "Originals were deleted with public copy.",
      );
    },
  );
  await check("trash and restore preserve the project privately", async () => {
    await mutate(a, "projects:trash", { projectId: pa });
    const trash = await query(a, "projects:listMine", {
      trashed: true,
      paginationOpts: { numItems: 20, cursor: null },
    });
    assert(
      trash.page.some((p) => p._id === pa),
      "Trash entry missing.",
    );
    await mutate(a, "projects:restore", { projectId: pa });
    const own = await query(a, "projects:get", { projectId: pa });
    assert(
      own.deletedAt === undefined &&
        own.visibility === "private" &&
        own.version === 3,
      "Restore changed saved project.",
    );
  });
  let recoveryCodes;
  await check(
    "recovery codes require authentication and current password",
    async () => {
      assert(
        (await query(anonymous, "recovery:status")) === null,
        "Anonymous recovery status leaked.",
      );
      await rejects(() =>
        action(anonymous, "recovery:generate", {
          currentPassword: credentials[0].password,
        }),
      );
      await rejects(() =>
        action(a, "recovery:generate", {
          currentPassword: "Definitely not the current password",
        }),
      );
      const generated = await action(a, "recovery:generate", {
        currentPassword: credentials[0].password,
      });
      assert(
        generated.codes.length === 6 &&
          new Set(generated.codes).size === 6 &&
          generated.codes.every((code) =>
            /^(?:[a-f0-9]{4}-){7}[a-f0-9]{4}$/.test(code),
          ),
        "Expected six distinct high-entropy recovery codes.",
      );
      recoveryCodes = generated.codes;
      const status = await query(a, "recovery:status");
      assert(
        status.configured && status.remaining === 6,
        "Recovery status did not persist.",
      );
    },
  );
  await check(
    "code rotation and foreign-account recovery are denied",
    async () => {
      const previous = recoveryCodes;
      ({ codes: recoveryCodes } = await action(a, "recovery:generate", {
        currentPassword: credentials[0].password,
      }));
      await rejects(() =>
        action(anonymous, "auth:signIn", {
          provider: "recovery",
          params: {
            email: credentials[0].email,
            code: previous[0],
            newPassword: randomBytes(24).toString("base64url"),
          },
        }),
      );
      await rejects(() =>
        action(anonymous, "auth:signIn", {
          provider: "recovery",
          params: {
            email: credentials[1].email,
            code: recoveryCodes[0],
            newPassword: randomBytes(24).toString("base64url"),
          },
        }),
      );
      await rejects(() =>
        action(anonymous, "auth:signIn", {
          provider: "recovery",
          params: {
            email: `canvas-qa-${runId}-unknown@example.invalid`,
            code: recoveryCodes[0],
            newPassword: randomBytes(24).toString("base64url"),
          },
        }),
      );
      assert(
        (await query(a, "recovery:status")).remaining === 6,
        "A failed foreign attempt consumed the owner's code.",
      );
    },
  );
  await check(
    "one-use recovery resets password and revokes previous app access",
    async () => {
      const newPassword = randomBytes(32).toString("base64url");
      const recovered = await action(anonymous, "auth:signIn", {
        provider: "recovery",
        params: {
          email: credentials[0].email,
          code: recoveryCodes[0].toUpperCase(),
          newPassword,
        },
      });
      assert(
        recovered.tokens?.token,
        "Recovery did not establish a standard auth session.",
      );
      assert(
        (await query(a, "users:me")) === null,
        "Previous session still exposes private profile state.",
      );
      await rejects(() => query(a, "projects:get", { projectId: pa }));
      await rejects(() =>
        action(a, "files:upload", {
          kind: "snapshot",
          data: new TextEncoder().encode('{"invalidated":true}').buffer,
        }),
      );
      const signed = await action(anonymous, "auth:signIn", {
        provider: "password",
        params: {
          email: credentials[0].email,
          password: newPassword,
          flow: "signIn",
        },
      });
      assert(signed.tokens?.token, "New password does not work.");
      a.setAuth(signed.tokens.token);
      const me = await query(a, "users:me");
      assert(me.userId === ids[0], "Recovery created a different user.");
      await rejects(() =>
        action(anonymous, "auth:signIn", {
          provider: "password",
          params: {
            email: credentials[0].email,
            password: credentials[0].password,
            flow: "signIn",
          },
        }),
      );
      await rejects(() =>
        action(anonymous, "auth:signIn", {
          provider: "recovery",
          params: {
            email: credentials[0].email,
            code: recoveryCodes[0],
            newPassword: randomBytes(32).toString("base64url"),
          },
        }),
      );
      const refresh = await action(anonymous, "auth:signIn", {
        refreshToken: credentials[0].refreshToken,
      });
      assert(!refresh.tokens, "Old session refreshed after recovery.");
      credentials[0].password = newPassword;
      assert(
        (await query(a, "recovery:status")).remaining === 5,
        "Used recovery code was not marked consumed.",
      );
    },
  );
  await check(
    "rotation after recovery invalidates remaining old codes",
    async () => {
      const oldUnused = recoveryCodes[1];
      ({ codes: recoveryCodes } = await action(a, "recovery:generate", {
        currentPassword: credentials[0].password,
      }));
      await rejects(() =>
        action(anonymous, "auth:signIn", {
          provider: "recovery",
          params: {
            email: credentials[0].email,
            code: oldUnused,
            newPassword: randomBytes(32).toString("base64url"),
          },
        }),
      );
      assert(
        (await query(a, "recovery:status")).remaining === 6,
        "Rotation did not replace all codes.",
      );
    },
  );
  await check(
    "recovery attempts are limited without revealing account existence",
    async () => {
      const { codes } = await action(b, "recovery:generate", {
        currentPassword: credentials[1].password,
      });
      for (let i = 0; i < 11; i++)
        await rejects(() =>
          action(anonymous, "auth:signIn", {
            provider: "recovery",
            params: {
              email: credentials[1].email,
              code: "f".repeat(32),
              newPassword: randomBytes(32).toString("base64url"),
            },
          }),
        );
      await rejects(() =>
        action(anonymous, "auth:signIn", {
          provider: "recovery",
          params: {
            email: credentials[1].email,
            code: codes[0],
            newPassword: randomBytes(32).toString("base64url"),
          },
        }),
      );
      assert(
        (await query(b, "recovery:status")).remaining === 6,
        "Rate-limited attempts consumed valid codes.",
      );
    },
  );
  await check("recovery storage contains only hashes", async () => {
    const audit = operator("testing:auditRecovery", { userIds: ids });
    assert(
      audit.onlyHashes && audit.storedCodes === 12,
      "Recovery storage audit failed.",
    );
  });
  await check(
    "operator moderation preserves private work and gates republishing until release",
    async () => {
      await action(a, "projects:setVisibility", {
        projectId: pa,
        visibility: "public",
      });
      operator("testing:moderateQa", { projectId: pa, reporterId: ids[1] });
      assert(
        (await query(b, "community:getArtwork", { artworkId })) === null,
        "Reviewed artwork remains public.",
      );
      await rejects(() =>
        action(a, "projects:setVisibility", {
          projectId: pa,
          visibility: "public",
        }),
      );
      await rejects(() => query(a, "moderation:pending", {}));
      const privateWork = await query(a, "projects:get", { projectId: pa });
      assert(
        privateWork.moderatedAt && (await fetch(privateWork.snapshotUrl)).ok,
        "Moderation deleted private originals.",
      );
      operator("testing:releaseQa", { projectId: pa });
      await action(a, "projects:setVisibility", {
        projectId: pa,
        visibility: "public",
      });
      assert(
        await query(b, "community:getArtwork", { artworkId }),
        "Release did not permit artist-led publishing.",
      );
      await action(a, "projects:setVisibility", {
        projectId: pa,
        visibility: "private",
      });
    },
  );
  await check(
    "completed image results survive a fresh query and decisions are owner-only and idempotent",
    async () => {
      assert(
        (await query(b, "quota:latest", { projectId: pb })) === null,
        "Empty project has an unexpected AI result.",
      );
      const fixture = operator("testing:seedCompletedImage", {
        userId: ids[1],
        projectId: pb,
      });
      assert(fixture.paidImageCalls === 0, "QA image fixture used a provider.");
      const latest = await query(b, "quota:latest", { projectId: pb });
      assert(
        latest?.jobId === fixture.jobId &&
          latest.state === "completed" &&
          !latest.decision &&
          latest.imageUrl,
        "Undecided result was not recovered after the action returned.",
      );
      assert(
        (await fetch(latest.imageUrl)).ok,
        "Recovered result cannot be opened.",
      );
      assert(
        !("storageId" in latest) && !("userId" in latest),
        "Private storage metadata leaked.",
      );
      await rejects(() => query(a, "quota:latest", { projectId: pb }));
      await rejects(() =>
        mutate(a, "quota:decide", {
          jobId: fixture.jobId,
          decision: "accepted",
        }),
      );
      const before = await query(b, "quota:usage");
      const decision = await mutate(b, "quota:decide", {
        jobId: fixture.jobId,
        decision: "accepted",
      });
      const replay = await mutate(b, "quota:decide", {
        jobId: fixture.jobId,
        decision: "accepted",
      });
      assert(
        replay.decidedAt === decision.decidedAt,
        "Decision replay changed its timestamp.",
      );
      await rejects(() =>
        mutate(b, "quota:decide", {
          jobId: fixture.jobId,
          decision: "discarded",
        }),
      );
      const persisted = await query(b, "quota:latest", { projectId: pb });
      assert(
        persisted.decision === "accepted" &&
          persisted.decidedAt === decision.decidedAt,
        "Decision did not persist.",
      );
      const after = await query(b, "quota:usage");
      assert(
        before.used === after.used && before.remaining === after.remaining,
        "Decision altered the AI allowance.",
      );
    },
  );
  await check(
    "abandoned pending image requests expire safely without retrying or refunding quota",
    async () => {
      const before = await query(b, "quota:usage");
      const expired = operator("testing:expireQaJob", {
        userId: ids[1],
        projectId: pb,
      });
      assert(
        expired.expired &&
          !expired.repeatedExpired &&
          expired.lateFinishDenied &&
          expired.paidImageCalls === 0,
        "Pending expiry or late-completion protection failed.",
      );
      const latest = await query(b, "quota:latest", { projectId: pb });
      assert(
        latest?.jobId === expired.jobId &&
          latest.state === "failed" &&
          latest.imageUrl === null &&
          latest.error.includes("Your original is safe"),
        "Expired request is not recoverable as a friendly failure.",
      );
      await rejects(() =>
        mutate(b, "quota:decide", {
          jobId: expired.jobId,
          decision: "accepted",
        }),
      );
      await rejects(() => mutate(b, "quota:expire", { jobId: expired.jobId }));
      const after = await query(b, "quota:usage");
      assert(
        after.used === before.used + 1 &&
          after.remaining === before.remaining - 1,
        "Expiry changed the attempted-request accounting.",
      );
    },
  );
} catch (error) {
  failure = error instanceof Error ? error.message : "Backend smoke failed.";
  console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} finally {
  const report = {
    runId,
    deployment,
    createdAt: new Date().toISOString(),
    results,
    passed: !failure,
    failure: failure ?? null,
    cleanup: { userIds: ids, projectIds, uploadedStorageIds, required: true },
    paidImageCalls: 0,
  };
  await mkdir(".frontend-craft/evidence", { recursive: true });
  await writeFile(
    ".frontend-craft/evidence/backend-smoke.json",
    JSON.stringify(report, null, 2),
  );
  await writeFile(
    `.frontend-craft/evidence/backend-smoke-${runId}.json`,
    JSON.stringify(report, null, 2),
  );
  await writeFile(
    ".frontend-craft/backend-smoke-results.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      passed: !failure,
      checks: results.length,
      qaUserIds: ids,
      qaProjectIds: projectIds,
      cleanupRequired: true,
      paidImageCalls: 0,
    }),
  );
}

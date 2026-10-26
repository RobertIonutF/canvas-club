// INTERNAL ONLY. Temporary QA maintenance is restricted to unmistakable test
// accounts and cannot be invoked by an app client, even an authenticated one.
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { anyApi } from "convex/server";
import { ConvexError, v } from "convex/values";
import { sha256Hex } from "./core";

export const qaAccount = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (
      !user?.email ||
      !/^canvas-qa-[a-f0-9]+-[01]@example\.invalid$/.test(user.email)
    )
      throw new ConvexError(
        "Maintenance only permits temporary Canvas Club QA accounts.",
      );
    return { userId };
  },
});
export const findQa = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    if (!/^canvas-qa-[a-f0-9]+-[01]@example\.invalid$/.test(email))
      throw new Error("Only QA addresses may be looked up.");
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    return { userId: user?._id ?? null };
  },
});
export const auditRecovery = internalQuery({
  args: { userIds: v.array(v.id("users")) },
  handler: async (ctx, { userIds }) => {
    if (userIds.length > 4)
      throw new Error("Only bounded QA accounts may be audited.");
    let storedCodes = 0,
      onlyHashes = true;
    for (const userId of userIds) {
      const user = await ctx.db.get(userId);
      if (
        !user?.email ||
        !/^canvas-qa-[a-f0-9]+-[01]@example\.invalid$/.test(user.email)
      )
        throw new Error("QA account required.");
      const rows = await ctx.db
        .query("recoveryCodes")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      storedCodes += rows.length;
      onlyHashes =
        onlyHashes &&
        rows.every(
          (row) =>
            /^[a-f0-9]{64}$/.test(row.codeHash) &&
            !("code" in row) &&
            !("rawCode" in row),
        );
    }
    return { storedCodes, onlyHashes };
  },
});
export const qaProject = internalQuery({
  args: { projectId: v.id("projects"), reporterId: v.optional(v.id("users")) },
  handler: async (ctx, { projectId, reporterId }) => {
    const p = await ctx.db.get(projectId);
    if (!p) throw new Error("QA project required.");
    const user = await ctx.db.get(p.userId);
    if (
      !user?.email ||
      !/^canvas-qa-[a-f0-9]+-[01]@example\.invalid$/.test(user.email)
    )
      throw new Error("QA project required.");
    if (!reporterId)
      return { ownerId: p.userId, artworkId: p.artworkId, reportId: null };
    const reporter = await ctx.db.get(reporterId);
    if (
      !reporter?.email ||
      !/^canvas-qa-[a-f0-9]+-[01]@example\.invalid$/.test(reporter.email) ||
      !p.artworkId
    )
      throw new Error("QA reporter required.");
    const report = await ctx.db
      .query("reports")
      .withIndex("by_user_artwork", (q) =>
        q.eq("userId", reporterId).eq("artworkId", p.artworkId!),
      )
      .unique();
    if (!report) throw new Error("QA report required.");
    return { ownerId: p.userId, artworkId: p.artworkId, reportId: report._id };
  },
});
export const moderateQa = internalAction({
  args: { projectId: v.id("projects"), reporterId: v.id("users") },
  handler: async (ctx, args) => {
    const p = await ctx.runQuery(anyApi.testing.qaProject, args);
    if (!p.reportId) throw new Error("QA report required.");
    return await ctx.runMutation(anyApi.moderation.resolve, {
      reportId: p.reportId,
      decision: "hide",
      note: "Temporary QA moderation hide; private originals must remain available.",
    });
  },
});
export const releaseQa = internalAction({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await ctx.runQuery(anyApi.testing.qaProject, { projectId });
    return await ctx.runMutation(anyApi.moderation.release, {
      projectId,
      note: "Temporary QA review released; user chooses whether to publish again.",
    });
  },
});
export const seedCompletedImage = internalAction({
  args: { userId: v.id("users"), projectId: v.id("projects") },
  handler: async (ctx, { userId, projectId }) => {
    await ctx.runQuery(anyApi.testing.qaAccount, { userId });
    const p = await ctx.runQuery(anyApi.testing.qaProject, { projectId });
    if (p.ownerId !== userId) throw new Error("QA project ownership mismatch.");
    const reservation = await ctx.runMutation(anyApi.quota.reserve, {
      userId,
      projectId,
      operation: "generate",
    });
    const raw = atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY9sAAAAASUVORK5CYII=",
    );
    const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    const storageId = await ctx.storage.store(
      new Blob([bytes], { type: "image/png" }),
    );
    await ctx.runMutation(anyApi.quota.finish, {
      jobId: reservation.jobId,
      storageId,
      success: true,
      usageJson: JSON.stringify({ qaFixture: true, paidImageCalls: 0 }),
    });
    return { jobId: reservation.jobId, paidImageCalls: 0 };
  },
});
export const expireQaJob = internalAction({
  args: { userId: v.id("users"), projectId: v.id("projects") },
  handler: async (ctx, { userId, projectId }) => {
    await ctx.runQuery(anyApi.testing.qaAccount, { userId });
    const p = await ctx.runQuery(anyApi.testing.qaProject, { projectId });
    if (p.ownerId !== userId) throw new Error("QA project ownership mismatch.");
    const reservation = await ctx.runMutation(anyApi.quota.reserve, {
      userId,
      projectId,
      operation: "generate",
    });
    const first = await ctx.runMutation(anyApi.quota.expire, {
      jobId: reservation.jobId,
    });
    const repeated = await ctx.runMutation(anyApi.quota.expire, {
      jobId: reservation.jobId,
    });
    let lateFinishDenied = false;
    try {
      await ctx.runMutation(anyApi.quota.finish, {
        jobId: reservation.jobId,
        success: false,
        error: "A late QA completion must be rejected.",
      });
    } catch {
      lateFinishDenied = true;
    }
    return {
      jobId: reservation.jobId,
      expired: first.expired,
      repeatedExpired: repeated.expired,
      lateFinishDenied,
      paidImageCalls: 0,
    };
  },
});
export const qaStorageSize = internalMutation({
  args: {
    userId: v.id("users"),
    storageId: v.id("_storage"),
    size: v.number(),
  },
  handler: async (ctx, { userId, storageId, size }) => {
    const user = await ctx.db.get(userId);
    if (
      !user?.email ||
      !/^canvas-qa-[a-f0-9]+-[01]@example\.invalid$/.test(user.email) ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > 250 * 1024 * 1024
    )
      throw new Error("Bounded QA storage fixture required.");
    const file = await ctx.db
      .query("files")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .unique();
    if (!file || file.userId !== userId)
      throw new Error("QA file ownership required.");
    await ctx.db.patch(file._id, { size });
    return { previousSize: file.size };
  },
});
export const storageBoundaryQa = internalAction({
  args: {
    userId: v.id("users"),
    projectId: v.id("projects"),
    previewStorageId: v.id("_storage"),
  },
  handler: async (ctx, { userId, projectId, previewStorageId }) => {
    await ctx.runQuery(anyApi.testing.qaAccount, { userId });
    const p = await ctx.runQuery(anyApi.testing.qaProject, { projectId });
    if (p.ownerId !== userId) throw new Error("QA project ownership required.");
    const original = await ctx.runMutation(anyApi.testing.qaStorageSize, {
      userId,
      storageId: previewStorageId,
      size: 250 * 1024 * 1024,
    });
    let preflightDenied = false,
      finishDenied = false,
      originalPreserved = false;
    let outputId;
    try {
      try {
        const unexpected = await ctx.runMutation(anyApi.quota.reserve, {
          userId,
          projectId,
          operation: "generate",
        });
        await ctx.runMutation(anyApi.quota.finish, {
          jobId: unexpected.jobId,
          success: false,
          error: "Unexpected QA capacity admission; no provider request made.",
        });
      } catch {
        preflightDenied = true;
      }
      if (!preflightDenied)
        throw new Error("AI storage preflight allowed a full account.");
      await ctx.runMutation(anyApi.testing.qaStorageSize, {
        userId,
        storageId: previewStorageId,
        size: original.previousSize,
      });
      const reservation = await ctx.runMutation(anyApi.quota.reserve, {
        userId,
        projectId,
        operation: "generate",
      });
      await ctx.runMutation(anyApi.testing.qaStorageSize, {
        userId,
        storageId: previewStorageId,
        size: 250 * 1024 * 1024,
      });
      const raw = atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY9sAAAAASUVORK5CYII=",
      );
      outputId = await ctx.storage.store(
        new Blob([Uint8Array.from(raw, (c) => c.charCodeAt(0))], {
          type: "image/png",
        }),
      );
      try {
        await ctx.runMutation(anyApi.quota.finish, {
          jobId: reservation.jobId,
          storageId: outputId,
          success: true,
        });
      } catch {
        finishDenied = true;
      }
      if (!finishDenied)
        throw new Error("AI completion allowed a concurrently full account.");
      await ctx.storage.delete(outputId);
      outputId = undefined;
      await ctx.runMutation(anyApi.quota.finish, {
        jobId: reservation.jobId,
        success: false,
        error: "QA storage-boundary failure; no provider request was made.",
      });
      originalPreserved = !!(await ctx.storage.get(previewStorageId));
      return {
        preflightDenied,
        finishDenied,
        originalPreserved,
        paidImageCalls: 0,
      };
    } finally {
      await ctx.runMutation(anyApi.testing.qaStorageSize, {
        userId,
        storageId: previewStorageId,
        size: original.previousSize,
      });
      if (outputId) await ctx.storage.delete(outputId);
    }
  },
});
export const exerciseQuota = internalAction({
  args: {
    userId: v.id("users"),
    otherUserId: v.id("users"),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(anyApi.testing.qaAccount, { userId: args.userId });
    await ctx.runQuery(anyApi.testing.qaAccount, { userId: args.otherUserId });
    let foreignDenied = false;
    try {
      await ctx.runMutation(anyApi.quota.reserve, {
        userId: args.otherUserId,
        projectId: args.projectId,
        operation: "generate",
      });
    } catch {
      foreignDenied = true;
    }
    if (!foreignDenied)
      throw new Error("Foreign quota reservation was allowed.");
    let concurrentDenied = false,
      replayDenied = false;
    for (let i = 0; i < 3; i++) {
      const job = await ctx.runMutation(anyApi.quota.reserve, {
        userId: args.userId,
        projectId: args.projectId,
        operation: "generate",
      });
      if (i === 0) {
        try {
          await ctx.runMutation(anyApi.quota.reserve, {
            userId: args.userId,
            projectId: args.projectId,
            operation: "generate",
          });
        } catch {
          concurrentDenied = true;
        }
      }
      await ctx.runMutation(anyApi.quota.finish, {
        jobId: job.jobId,
        success: false,
        error: "Temporary QA reservation; no provider request was made.",
      });
      if (i === 0) {
        try {
          await ctx.runMutation(anyApi.quota.finish, {
            jobId: job.jobId,
            success: false,
            error: "Replay QA.",
          });
        } catch {
          replayDenied = true;
        }
      }
    }
    let capDenied = false;
    try {
      await ctx.runMutation(anyApi.quota.reserve, {
        userId: args.userId,
        projectId: args.projectId,
        operation: "generate",
      });
    } catch {
      capDenied = true;
    }
    if (!capDenied) throw new Error("Daily quota cap was not enforced.");
    if (!concurrentDenied || !replayDenied)
      throw new Error("Quota concurrency or replay protection failed.");
    return {
      foreignDenied,
      capDenied,
      concurrentDenied,
      replayDenied,
      reservations: 3,
      paidImageCalls: 0,
    };
  },
});
export const cleanup = internalMutation({
  args: {
    userIds: v.array(v.id("users")),
    orphanStorageIds: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, { userIds, orphanStorageIds = [] }) => {
    if (userIds.length > 4)
      throw new ConvexError("Only a bounded QA run may be removed.");
    const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));
    for (const user of users) {
      if (
        user &&
        (!user.email ||
          !/^canvas-qa-[a-f0-9]+-[01]@example\.invalid$/.test(user.email))
      )
        throw new ConvexError("Cleanup refused a non-QA account.");
    }
    let rowsRemoved = 0,
      storageDeleted = 0;
    if (orphanStorageIds.length > 20)
      throw new ConvexError("Too many QA orphan uploads.");
    const grants = (
      await Promise.all(
        userIds.map((userId) =>
          ctx.db
            .query("uploadGrants")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .collect(),
        ),
      )
    ).flat();
    for (const storageId of orphanStorageIds) {
      const registered = await ctx.db
        .query("files")
        .withIndex("by_storage", (q) => q.eq("storageId", storageId))
        .unique();
      if (registered) {
        if (!userIds.includes(registered.userId))
          throw new ConvexError("Cleanup refused a non-QA file.");
        continue;
      }
      const meta = await ctx.db.system.get(storageId);
      if (!meta) continue;
      if (
        !grants.some(
          (g) =>
            g.sha256 === sha256Hex(meta.sha256) &&
            meta._creationTime >= g.expiresAt - 10 * 60_000 &&
            meta._creationTime <= g.expiresAt,
        )
      )
        throw new ConvexError("Orphan upload did not match a QA grant.");
      if (
        await ctx.db
          .query("artworks")
          .filter((q) => q.eq(q.field("previewStorageId"), storageId))
          .first()
      )
        throw new ConvexError("Cleanup refused a referenced public preview.");
      await ctx.storage.delete(storageId);
      storageDeleted++;
    }
    const remove = async (id: Parameters<typeof ctx.db.delete>[0]) => {
      await ctx.db.delete(id);
      rowsRemoved++;
    };
    for (let i = 0; i < userIds.length; i++) {
      const userId = userIds[i];
      const user = users[i];
      if (!user) continue;
      const files = await ctx.db
        .query("files")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      for (const f of files) {
        await ctx.storage.delete(f.storageId);
        storageDeleted++;
        await remove(f._id);
      }
      const projects = await ctx.db
        .query("projects")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      for (const p of projects) {
        const revs = await ctx.db
          .query("revisions")
          .withIndex("by_project", (q) => q.eq("projectId", p._id))
          .collect();
        for (const r of revs) await remove(r._id);
        await remove(p._id);
      }
      const arts = await ctx.db
        .query("artworks")
        .withIndex("by_user_active", (q) => q.eq("userId", userId))
        .collect();
      for (const a of arts) {
        if (a.active) {
          await ctx.storage.delete(a.previewStorageId);
          storageDeleted++;
        }
        for (const l of await ctx.db
          .query("likes")
          .withIndex("by_artwork_user", (q) => q.eq("artworkId", a._id))
          .collect())
          await remove(l._id);
        for (const c of await ctx.db
          .query("comments")
          .withIndex("by_artwork", (q) => q.eq("artworkId", a._id))
          .collect())
          await remove(c._id);
        await remove(a._id);
      }
      for (const c of await ctx.db
        .query("comments")
        .withIndex("by_user_created", (q) => q.eq("userId", userId))
        .collect()) {
        const a = await ctx.db.get(c.artworkId);
        if (a)
          await ctx.db.patch(a._id, {
            commentsCount: Math.max(0, a.commentsCount - 1),
          });
        await remove(c._id);
      }
      for (const p of await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect())
        await remove(p._id);
      for (const code of await ctx.db
        .query("recoveryCodes")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect())
        await remove(code._id);
      for (const g of await ctx.db
        .query("uploadGrants")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect())
        await remove(g._id);
      for (const f of await ctx.db
        .query("follows")
        .withIndex("by_pair", (q) => q.eq("userId", userId))
        .collect())
        await remove(f._id);
      for (const f of await ctx.db
        .query("follows")
        .withIndex("by_target", (q) => q.eq("targetUserId", userId))
        .collect())
        await remove(f._id);
      for (const b of await ctx.db
        .query("blocks")
        .filter((q) =>
          q.or(
            q.eq(q.field("userId"), userId),
            q.eq(q.field("targetUserId"), userId),
          ),
        )
        .collect())
        await remove(b._id);
      for (const r of await ctx.db
        .query("reports")
        .withIndex("by_user_artwork", (q) => q.eq("userId", userId))
        .collect())
        await remove(r._id);
      for (const n of await ctx.db
        .query("notifications")
        .filter((q) =>
          q.or(
            q.eq(q.field("userId"), userId),
            q.eq(q.field("actorId"), userId),
          ),
        )
        .collect())
        await remove(n._id);
      for (const c of await ctx.db
        .query("completions")
        .withIndex("by_user_week", (q) => q.eq("userId", userId))
        .collect())
        await remove(c._id);
      const jobs = await ctx.db
        .query("imageJobs")
        .withIndex("by_user_created", (q) => q.eq("userId", userId))
        .collect();
      const byDay = new Map<string, number>();
      for (const j of jobs) {
        byDay.set(j.day, (byDay.get(j.day) ?? 0) + 1);
        await remove(j._id);
      }
      for (const [day, count] of byDay) {
        const g = await ctx.db
          .query("usage")
          .withIndex("by_key", (q) => q.eq("key", `images:global:${day}`))
          .unique();
        if (g)
          await ctx.db.patch(g._id, { count: Math.max(0, g.count - count) });
      }
      for (const row of await ctx.db.query("usage").collect())
        if (row.key.includes(`:${userId}:`)) await remove(row._id);
      for (const session of await ctx.db
        .query("authSessions")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .collect()) {
        for (const token of await ctx.db
          .query("authRefreshTokens")
          .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
          .collect())
          await remove(token._id);
        for (const verifier of await ctx.db
          .query("authVerifiers")
          .filter((q) => q.eq(q.field("sessionId"), session._id))
          .collect())
          await remove(verifier._id);
        await remove(session._id);
      }
      for (const account of await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
        .collect()) {
        for (const code of await ctx.db
          .query("authVerificationCodes")
          .withIndex("accountId", (q) => q.eq("accountId", account._id))
          .collect())
          await remove(code._id);
        await remove(account._id);
      }
      for (const rate of await ctx.db.query("authRateLimits").collect())
        if (rate.identifier.includes(user.email!)) await remove(rate._id);
      await remove(userId);
    }
    return {
      usersRemoved: users.filter(Boolean).length,
      rowsRemoved,
      storageDeleted,
    };
  },
});

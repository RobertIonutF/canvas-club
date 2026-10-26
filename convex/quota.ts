import { internalMutation, mutation, query } from "./_generated/server";
import { anyApi } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { readCalendar } from "./calendar";
import {
  consume,
  currentUser,
  dayKey,
  ensureProfile,
  ownProject,
  requireUser,
} from "./core";
function limit(env: string | undefined, fallback: number, max: number) {
  const n = Number(env);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}
const userLimit = () => limit(process.env.AI_DAILY_USER_LIMIT, 3, 20);
const globalLimit = () => limit(process.env.AI_DAILY_GLOBAL_LIMIT, 30, 200);
async function assertAiStorageCapacity(
  ctx: MutationCtx,
  userId: Id<"users">,
  additionalBytes: number,
) {
  const files = await ctx.db
    .query("files")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(1001);
  if (
    files.length >= 1000 ||
    files.reduce((total, file) => total + file.size, 0) + additionalBytes >
      250 * 1024 * 1024
  )
    throw new ConvexError(
      "Your cloud storage allowance is nearly full. Download project backups and contact the app owner before more AI requests.",
    );
}
export const latest = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const userId = await requireUser(ctx);
    await ownProject(ctx, projectId, userId);
    const job = await ctx.db
      .query("imageJobs")
      .withIndex("by_project_created", (q) => q.eq("projectId", projectId))
      .order("desc")
      .first();
    if (!job || job.userId !== userId) return null;
    return {
      jobId: job._id,
      state: job.state,
      operation: job.operation,
      error: job.error,
      imageUrl:
        job.state === "completed" && job.storageId
          ? await ctx.storage.getUrl(job.storageId)
          : null,
      decision: job.decision,
      decidedAt: job.decidedAt,
      createdAt: job.createdAt,
    };
  },
});
export const decide = mutation({
  args: {
    jobId: v.id("imageJobs"),
    decision: v.union(v.literal("accepted"), v.literal("discarded")),
  },
  handler: async (ctx, { jobId, decision }) => {
    const userId = await requireUser(ctx);
    const job = await ctx.db.get(jobId);
    if (!job || job.userId !== userId || job.state !== "completed")
      throw new ConvexError("Completed image unavailable.");
    await ownProject(ctx, job.projectId, userId, true);
    if (job.decision) {
      if (job.decision !== decision)
        throw new ConvexError("This image already has a saved decision.");
      return { decision: job.decision, decidedAt: job.decidedAt! };
    }
    const decidedAt = Date.now();
    await ctx.db.patch(jobId, { decision, decidedAt });
    return { decision, decidedAt };
  },
});
export const usage = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUser(ctx);
    if (!userId) return null;
    const calendar = await readCalendar(ctx);
    const day = calendar.day;
    const row = await ctx.db
      .query("usage")
      .withIndex("by_key", (q) => q.eq("key", `images:${userId}:${day}`))
      .unique();
    const global = await ctx.db
      .query("usage")
      .withIndex("by_key", (q) => q.eq("key", `images:global:${day}`))
      .unique();
    return {
      used: row?.count ?? 0,
      limit: userLimit(),
      remaining: Math.max(0, userLimit() - (row?.count ?? 0)),
      globalAvailable: (global?.count ?? 0) < globalLimit(),
      resetsAt: new Date(calendar.startAt + 86_400_000).toISOString(),
      day,
    };
  },
});
export const reserve = internalMutation({
  args: {
    userId: v.id("users"),
    projectId: v.id("projects"),
    operation: v.union(v.literal("generate"), v.literal("edit")),
  },
  handler: async (ctx, { userId, projectId, operation }) => {
    const p = await ownProject(ctx, projectId, userId);
    await ensureProfile(ctx, userId);
    if (operation === "edit" && !p.previewStorageId)
      throw new ConvexError("Save a sketch before using an AI edit.");
    const pending = await ctx.db
      .query("imageJobs")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(10);
    if (
      pending.some(
        (j) => j.state === "pending" && Date.now() - j.createdAt < 5 * 60_000,
      )
    )
      throw new ConvexError(
        "Your image is still being made. Please wait before starting another.",
      );
    await assertAiStorageCapacity(ctx, userId, 12 * 1024 * 1024);
    const day = dayKey();
    await consume(ctx, `images:${userId}:${day}`, userLimit());
    await consume(ctx, `images:global:${day}`, globalLimit());
    const jobId = await ctx.db.insert("imageJobs", {
      userId,
      projectId,
      operation,
      state: "pending",
      day,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(5 * 60_000, anyApi.quota.expire, { jobId });
    return {
      jobId,
      previewStorageId: p.previewStorageId,
      sourceUrl: p.previewStorageId
        ? await ctx.storage.getUrl(p.previewStorageId)
        : null,
    };
  },
});
export const expire = internalMutation({
  args: { jobId: v.id("imageJobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job || job.state !== "pending") return { expired: false };
    await ctx.db.patch(jobId, {
      state: "failed",
      error:
        "This request did not finish. Your original is safe. You can choose to try again.",
      completedAt: Date.now(),
    });
    return { expired: true };
  },
});
export const finish = internalMutation({
  args: {
    jobId: v.id("imageJobs"),
    storageId: v.optional(v.id("_storage")),
    success: v.boolean(),
    error: v.optional(v.string()),
    usageJson: v.optional(v.string()),
  },
  handler: async (ctx, { jobId, storageId, success, error, usageJson }) => {
    const job = await ctx.db.get(jobId);
    if (!job || job.state !== "pending")
      throw new ConvexError(
        "Image job has already finished or is unavailable.",
      );
    if (success && !storageId)
      throw new ConvexError("Image output is missing.");
    if (storageId) {
      const meta = await ctx.db.system.get(storageId);
      if (!meta || meta.size > 12 * 1024 * 1024)
        throw new ConvexError("Image output is too large.");
      const existing = await ctx.db
        .query("files")
        .withIndex("by_storage", (q) => q.eq("storageId", storageId))
        .unique();
      if (existing)
        throw new ConvexError("Image output is already registered.");
      await assertAiStorageCapacity(ctx, job.userId, meta.size);
      await ctx.db.insert("files", {
        userId: job.userId,
        storageId,
        kind: "generated",
        size: meta.size,
        createdAt: Date.now(),
      });
    }
    await ctx.db.patch(jobId, {
      state: success ? "completed" : "failed",
      storageId,
      error: error?.slice(0, 300),
      usageJson: usageJson?.slice(0, 10000),
      completedAt: Date.now(),
    });
    return {
      storageId,
      imageUrl: storageId ? await ctx.storage.getUrl(storageId) : null,
    };
  },
});

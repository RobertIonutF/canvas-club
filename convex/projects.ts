import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { anyApi, paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import {
  boundedPage,
  consume,
  dayKey,
  ensureProfile,
  ownFile,
  ownProject,
  requireUser,
  text,
} from "./core";

const medium = v.union(
  v.literal("manual"),
  v.literal("assisted"),
  v.literal("generated"),
);
async function card(
  ctx: QueryCtx | MutationCtx,
  p: Doc<"projects">,
  full = false,
) {
  return {
    ...p,
    imageUrl: p.previewStorageId
      ? await ctx.storage.getUrl(p.previewStorageId)
      : null,
    ...(full
      ? {
          snapshotUrl: p.snapshotStorageId
            ? await ctx.storage.getUrl(p.snapshotStorageId)
            : null,
        }
      : {}),
  };
}
async function unpublish(ctx: MutationCtx, p: Doc<"projects">) {
  if (p.artworkId) {
    const a = await ctx.db.get(p.artworkId);
    if (a?.active) {
      await ctx.storage.delete(a.previewStorageId);
      await ctx.db.patch(a._id, { active: false, updatedAt: Date.now() });
    }
  }
  await ctx.db.patch(p._id, { visibility: "private" });
}
async function retainRevisions(
  ctx: MutationCtx,
  projectId: Doc<"projects">["_id"],
) {
  const revisions = await ctx.db
    .query("revisions")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .order("desc")
    .take(22);
  for (const old of revisions.slice(20)) {
    await ctx.db.delete(old._id);
    for (const [storageId, kind] of [
      [old.snapshotStorageId, "snapshot"],
      [old.previewStorageId, "preview"],
    ] as const) {
      const projects =
        kind === "snapshot"
          ? await ctx.db
              .query("projects")
              .withIndex("by_snapshot", (q) =>
                q.eq("snapshotStorageId", storageId),
              )
              .first()
          : await ctx.db
              .query("projects")
              .withIndex("by_preview", (q) =>
                q.eq("previewStorageId", storageId),
              )
              .first();
      const kept =
        kind === "snapshot"
          ? await ctx.db
              .query("revisions")
              .withIndex("by_snapshot", (q) =>
                q.eq("snapshotStorageId", storageId),
              )
              .first()
          : await ctx.db
              .query("revisions")
              .withIndex("by_preview", (q) =>
                q.eq("previewStorageId", storageId),
              )
              .first();
      if (!projects && !kept) {
        const record = await ctx.db
          .query("files")
          .withIndex("by_storage", (q) => q.eq("storageId", storageId))
          .unique();
        if (record && record.kind === kind) {
          await ctx.storage.delete(storageId);
          await ctx.db.delete(record._id);
        }
      }
    }
  }
}
export const listMine = query({
  args: {
    paginationOpts: paginationOptsValidator,
    trashed: v.optional(v.boolean()),
  },
  handler: async (ctx, { paginationOpts, trashed }) => {
    const userId = await requireUser(ctx);
    const page = await ctx.db
      .query("projects")
      .withIndex("by_user_updated", (q) => q.eq("userId", userId))
      .filter((q) =>
        trashed
          ? q.neq(q.field("deletedAt"), undefined)
          : q.eq(q.field("deletedAt"), undefined),
      )
      .order("desc")
      .paginate(boundedPage(paginationOpts));
    return {
      ...page,
      page: await Promise.all(page.page.map((p) => card(ctx, p))),
    };
  },
});
export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const userId = await requireUser(ctx);
    return await card(
      ctx,
      await ownProject(ctx, projectId, userId, true),
      true,
    );
  },
});
export const create = mutation({
  args: {
    title: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  handler: async (ctx, { title, width = 1024, height = 1024 }) => {
    const userId = await requireUser(ctx);
    await ensureProfile(ctx, userId);
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 64 ||
      height < 64 ||
      width > 2048 ||
      height > 2048
    )
      throw new ConvexError("Canvas dimensions must be 64–2048 pixels.");
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(101);
    if (existing.length >= 100)
      throw new ConvexError("The beta supports 100 projects per artist.");
    await consume(ctx, `projects:${userId}:${dayKey()}`, 20);
    const now = Date.now();
    return await ctx.db.insert("projects", {
      userId,
      title: text(title ?? "Untitled sketch", 100, "Title", 1),
      description: "",
      width,
      height,
      medium: "manual",
      version: 0,
      isPinned: false,
      visibility: "private",
      createdAt: now,
      updatedAt: now,
    });
  },
});
export const save = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    snapshotStorageId: v.id("_storage"),
    previewStorageId: v.id("_storage"),
    medium,
    expectedVersion: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const p = await ownProject(ctx, args.projectId, userId);
    if (p.version !== args.expectedVersion)
      throw new ConvexError(
        "A newer save exists. Reload it before replacing your cloud copy.",
      );
    await ownFile(ctx, args.snapshotStorageId, userId, "snapshot");
    await ownFile(ctx, args.previewStorageId, userId, "preview");
    const title =
      args.title === undefined ? p.title : text(args.title, 100, "Title", 1);
    const description =
      args.description === undefined
        ? p.description
        : text(args.description, 1000, "Description");
    const version = p.version + 1;
    const now = Date.now();
    await ctx.db.insert("revisions", {
      projectId: p._id,
      userId,
      version,
      snapshotStorageId: args.snapshotStorageId,
      previewStorageId: args.previewStorageId,
      medium: args.medium,
      title,
      createdAt: now,
    });
    await ctx.db.patch(p._id, {
      title,
      description,
      snapshotStorageId: args.snapshotStorageId,
      previewStorageId: args.previewStorageId,
      medium: args.medium,
      version,
      updatedAt: now,
    });
    await retainRevisions(ctx, p._id);
    return { version };
  },
});
export const pin = mutation({
  args: { projectId: v.id("projects"), pinned: v.boolean() },
  handler: async (ctx, { projectId, pinned }) => {
    const userId = await requireUser(ctx);
    await ownProject(ctx, projectId, userId);
    if (pinned) {
      const existing = await ctx.db
        .query("projects")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .filter((q) =>
          q.and(
            q.eq(q.field("isPinned"), true),
            q.eq(q.field("deletedAt"), undefined),
          ),
        )
        .take(7);
      if (existing.length >= 6 && !existing.some((p) => p._id === projectId))
        throw new ConvexError("Choose up to six personal favorites.");
    }
    await ctx.db.patch(projectId, { isPinned: pinned });
    return { ok: true };
  },
});
export const trash = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const userId = await requireUser(ctx);
    const p = await ownProject(ctx, projectId, userId);
    await unpublish(ctx, p);
    await ctx.db.patch(projectId, {
      deletedAt: Date.now(),
      isPinned: false,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});
export const restore = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const userId = await requireUser(ctx);
    await ownProject(ctx, projectId, userId, true);
    await ctx.db.patch(projectId, {
      deletedAt: undefined,
      visibility: "private",
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});
export const revisions = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const userId = await requireUser(ctx);
    await ownProject(ctx, projectId, userId, true);
    const rows = await ctx.db
      .query("revisions")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .order("desc")
      .take(20);
    return await Promise.all(
      rows.map(async (r) => ({
        ...r,
        imageUrl: await ctx.storage.getUrl(r.previewStorageId),
      })),
    );
  },
});
export const restoreRevision = mutation({
  args: {
    projectId: v.id("projects"),
    revisionId: v.id("revisions"),
    expectedVersion: v.number(),
  },
  handler: async (ctx, { projectId, revisionId, expectedVersion }) => {
    const userId = await requireUser(ctx);
    const p = await ownProject(ctx, projectId, userId);
    const r = await ctx.db.get(revisionId);
    if (!r || r.projectId !== projectId || r.userId !== userId)
      throw new ConvexError("Revision unavailable.");
    if (p.version !== expectedVersion)
      throw new ConvexError("A newer save exists. Reload first.");
    const version = p.version + 1;
    await ctx.db.insert("revisions", {
      projectId,
      userId,
      version,
      snapshotStorageId: r.snapshotStorageId,
      previewStorageId: r.previewStorageId,
      medium: r.medium,
      title: r.title,
      createdAt: Date.now(),
    });
    await ctx.db.patch(projectId, {
      snapshotStorageId: r.snapshotStorageId,
      previewStorageId: r.previewStorageId,
      medium: r.medium,
      title: r.title,
      version,
      updatedAt: Date.now(),
    });
    await retainRevisions(ctx, projectId);
    return { version };
  },
});
export const publishingData = internalQuery({
  args: { userId: v.id("users"), projectId: v.id("projects") },
  handler: async (ctx, { userId, projectId }) => {
    const p = await ownProject(ctx, projectId, userId);
    if (p.moderatedAt !== undefined)
      throw new ConvexError(
        "Sharing for this project was paused after review. Contact the app owner.",
      );
    if (!p.previewStorageId || !p.snapshotStorageId)
      throw new ConvexError("Save your project before sharing it.");
    return p;
  },
});
export const finishPublishing = internalMutation({
  args: {
    userId: v.id("users"),
    projectId: v.id("projects"),
    version: v.number(),
    publicPreviewId: v.id("_storage"),
  },
  handler: async (ctx, { userId, projectId, version, publicPreviewId }) => {
    const p = await ownProject(ctx, projectId, userId);
    if (p.moderatedAt !== undefined)
      throw new ConvexError(
        "Sharing for this project was paused after review. Contact the app owner.",
      );
    if (p.version !== version)
      throw new ConvexError(
        "Your work changed during publishing. Please share the latest save.",
      );
    await consume(ctx, `publishes:${userId}:${dayKey()}`, 30);
    if (!p.previewStorageId || !p.snapshotStorageId)
      throw new ConvexError("Save before sharing.");
    const patch = {
      userId,
      projectId,
      title: p.title,
      description: p.description,
      width: p.width,
      height: p.height,
      medium: p.medium,
      previewStorageId: publicPreviewId,
      publishedVersion: version,
      active: true,
      updatedAt: Date.now(),
    };
    let artworkId = p.artworkId;
    if (artworkId) {
      const a = await ctx.db.get(artworkId);
      if (a) {
        if (a.active) await ctx.storage.delete(a.previewStorageId);
        await ctx.db.patch(artworkId, patch);
      } else artworkId = undefined;
    }
    if (!artworkId)
      artworkId = await ctx.db.insert("artworks", {
        ...patch,
        createdAt: Date.now(),
        likesCount: 0,
        commentsCount: 0,
      });
    await ctx.db.patch(projectId, { artworkId, visibility: "public" });
    return { artworkId };
  },
});
export const makePrivate = internalMutation({
  args: { userId: v.id("users"), projectId: v.id("projects") },
  handler: async (ctx, { userId, projectId }) => {
    const p = await ownProject(ctx, projectId, userId, true);
    await unpublish(ctx, p);
    return { artworkId: p.artworkId };
  },
});
export const setVisibility = action({
  args: {
    projectId: v.id("projects"),
    visibility: v.union(v.literal("private"), v.literal("public")),
  },
  handler: async (ctx, { projectId, visibility }) => {
    const userId = await requireUser(ctx);
    if (visibility === "private")
      return await ctx.runMutation(anyApi.projects.makePrivate, {
        userId,
        projectId,
      });
    const p = await ctx.runQuery(anyApi.projects.publishingData, {
      userId,
      projectId,
    });
    const preview = await ctx.storage.get(p.previewStorageId);
    if (!preview)
      throw new ConvexError("Preview unavailable. Save your project again.");
    const publicPreviewId = await ctx.storage.store(preview);
    try {
      return await ctx.runMutation(anyApi.projects.finishPublishing, {
        userId,
        projectId,
        version: p.version,
        publicPreviewId,
      });
    } catch (error) {
      await ctx.storage.delete(publicPreviewId);
      throw error;
    }
  },
});

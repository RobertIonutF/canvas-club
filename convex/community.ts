import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import {
  currentUser,
  artist,
  artwork,
  blocked,
  boundedPage,
  consume,
  dayKey,
  ensureProfile,
  notify,
  requireUser,
  text,
  visibleArtwork,
} from "./core";
const medium = v.union(
  v.literal("manual"),
  v.literal("assisted"),
  v.literal("generated"),
);

export const feed = query({
  args: {
    paginationOpts: paginationOptsValidator,
    medium: v.optional(medium),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewer = await currentUser(ctx);
    const search = (args.search ?? "").trim();
    if (search.length > 80) throw new ConvexError("Use a shorter search.");
    let page;
    if (search) {
      page = await ctx.db
        .query("artworks")
        .withSearchIndex("search_title", (q) => {
          const s = q.search("title", search).eq("active", true);
          return args.medium ? s.eq("medium", args.medium) : s;
        })
        .paginate(boundedPage(args.paginationOpts));
    } else if (args.medium) {
      page = await ctx.db
        .query("artworks")
        .withIndex("by_active_medium", (q) =>
          q.eq("active", true).eq("medium", args.medium!),
        )
        .order("desc")
        .paginate(boundedPage(args.paginationOpts));
    } else {
      page = await ctx.db
        .query("artworks")
        .withIndex("by_active_created", (q) => q.eq("active", true))
        .order("desc")
        .paginate(boundedPage(args.paginationOpts));
    }
    const items = await Promise.all(
      page.page.map((a) => artwork(ctx, a, viewer)),
    );
    return { ...page, page: items.filter((a) => a !== null) };
  },
});
export const getArtwork = query({
  args: { artworkId: v.id("artworks") },
  handler: async (ctx, { artworkId }) => {
    const a = await ctx.db.get(artworkId);
    return a ? await artwork(ctx, a, await currentUser(ctx)) : null;
  },
});
export const byArtist = query({
  args: { handle: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { handle, paginationOpts }) => {
    const viewer = await currentUser(ctx);
    const p = await ctx.db
      .query("profiles")
      .withIndex("by_handle", (q) => q.eq("handle", handle.toLowerCase()))
      .unique();
    if (!p || (await blocked(ctx, viewer, p.userId)))
      return { page: [], isDone: true, continueCursor: "" };
    const page = await ctx.db
      .query("artworks")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", p.userId).eq("active", true),
      )
      .order("desc")
      .paginate(boundedPage(paginationOpts));
    return {
      ...page,
      page: (
        await Promise.all(page.page.map((a) => artwork(ctx, a, viewer)))
      ).filter((a) => a !== null),
    };
  },
});
export const like = mutation({
  args: { artworkId: v.id("artworks") },
  handler: async (ctx, { artworkId }) => {
    const userId = await requireUser(ctx);
    const a = await visibleArtwork(ctx, artworkId, userId);
    await ensureProfile(ctx, userId);
    await consume(ctx, `likes:${userId}:${dayKey()}`, 100);
    const existing = await ctx.db
      .query("likes")
      .withIndex("by_artwork_user", (q) =>
        q.eq("artworkId", artworkId).eq("userId", userId),
      )
      .unique();
    const liked = !existing;
    const likesCount = Math.max(0, a.likesCount + (liked ? 1 : -1));
    if (existing) await ctx.db.delete(existing._id);
    else {
      await ctx.db.insert("likes", {
        userId,
        artworkId,
        createdAt: Date.now(),
      });
      await notify(ctx, a.userId, userId, "like", artworkId);
    }
    await ctx.db.patch(artworkId, { likesCount });
    return { liked, likesCount };
  },
});
export const listComments = query({
  args: {
    artworkId: v.id("artworks"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { artworkId, paginationOpts }) => {
    const viewer = await currentUser(ctx);
    const a = await ctx.db.get(artworkId);
    if (!a || !a.active || (await blocked(ctx, viewer, a.userId)))
      return { page: [], isDone: true, continueCursor: "" };
    const page = await ctx.db
      .query("comments")
      .withIndex("by_artwork", (q) => q.eq("artworkId", artworkId))
      .order("desc")
      .paginate(boundedPage(paginationOpts));
    const comments = await Promise.all(
      page.page.map(async (c) =>
        (await blocked(ctx, viewer, c.userId))
          ? null
          : {
              _id: c._id,
              body: c.body,
              createdAt: c.createdAt,
              author: await artist(ctx, c.userId),
            },
      ),
    );
    return { ...page, page: comments.filter((c) => c !== null) };
  },
});
export const comment = mutation({
  args: { artworkId: v.id("artworks"), body: v.string() },
  handler: async (ctx, { artworkId, body }) => {
    const userId = await requireUser(ctx);
    const a = await visibleArtwork(ctx, artworkId, userId);
    await ensureProfile(ctx, userId);
    const clean = text(body, 1000, "Comment", 1);
    await consume(ctx, `comments:${userId}:${dayKey()}`, 30);
    const recent = await ctx.db
      .query("comments")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(1);
    if (recent[0] && Date.now() - recent[0].createdAt < 5000)
      throw new ConvexError(
        "Give the conversation a moment before commenting again.",
      );
    if (recent[0]?.body === clean && Date.now() - recent[0].createdAt < 60_000)
      throw new ConvexError("That comment was already sent.");
    const id = await ctx.db.insert("comments", {
      userId,
      artworkId,
      body: clean,
      createdAt: Date.now(),
    });
    await ctx.db.patch(artworkId, { commentsCount: a.commentsCount + 1 });
    await notify(ctx, a.userId, userId, "comment", artworkId);
    return id;
  },
});
export const deleteComment = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, { commentId }) => {
    const userId = await requireUser(ctx);
    const c = await ctx.db.get(commentId);
    if (!c || c.userId !== userId)
      throw new ConvexError("Comment unavailable.");
    await ctx.db.delete(c._id);
    const a = await ctx.db.get(c.artworkId);
    if (a)
      await ctx.db.patch(a._id, {
        commentsCount: Math.max(0, a.commentsCount - 1),
      });
    return { ok: true };
  },
});
export const follow = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId: targetUserId }) => {
    const userId = await requireUser(ctx);
    if (userId === targetUserId)
      throw new ConvexError("You cannot follow yourself.");
    if (
      !(await ctx.db.get(targetUserId)) ||
      (await blocked(ctx, userId, targetUserId))
    )
      throw new ConvexError("Artist unavailable.");
    await ensureProfile(ctx, userId);
    await consume(ctx, `follows:${userId}:${dayKey()}`, 50);
    const existing = await ctx.db
      .query("follows")
      .withIndex("by_pair", (q) =>
        q.eq("userId", userId).eq("targetUserId", targetUserId),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { following: false };
    }
    await ctx.db.insert("follows", {
      userId,
      targetUserId,
      createdAt: Date.now(),
    });
    await notify(ctx, targetUserId, userId, "follow");
    return { following: true };
  },
});
export const report = mutation({
  args: { artworkId: v.id("artworks"), reason: v.string() },
  handler: async (ctx, { artworkId, reason }) => {
    const userId = await requireUser(ctx);
    await visibleArtwork(ctx, artworkId, userId);
    const clean = text(reason, 1000, "Report reason", 3);
    const existing = await ctx.db
      .query("reports")
      .withIndex("by_user_artwork", (q) =>
        q.eq("userId", userId).eq("artworkId", artworkId),
      )
      .unique();
    if (existing) return { ok: true };
    await consume(ctx, `reports:${userId}:${dayKey()}`, 10);
    await ctx.db.insert("reports", {
      userId,
      artworkId,
      reason: clean,
      status: "pending",
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});
export const block = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId: targetUserId }) => {
    const userId = await requireUser(ctx);
    if (userId === targetUserId)
      throw new ConvexError("You cannot block yourself.");
    if (!(await ctx.db.get(targetUserId)))
      throw new ConvexError("Artist unavailable.");
    const existing = await ctx.db
      .query("blocks")
      .withIndex("by_pair", (q) =>
        q.eq("userId", userId).eq("targetUserId", targetUserId),
      )
      .unique();
    if (!existing) {
      await consume(ctx, `blocks:${userId}:${dayKey()}`, 50);
      await ctx.db.insert("blocks", {
        userId,
        targetUserId,
        createdAt: Date.now(),
      });
    }
    return { ok: true };
  },
});
export const blockedUsers = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("blocks")
      .withIndex("by_pair", (q) => q.eq("userId", userId))
      .take(200);
    return await Promise.all(rows.map((b) => artist(ctx, b.targetUserId)));
  },
});
export const unblock = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId: targetUserId }) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query("blocks")
      .withIndex("by_pair", (q) =>
        q.eq("userId", userId).eq("targetUserId", targetUserId),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return { ok: true };
  },
});
export const notifications = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const userId = await requireUser(ctx);
    const page = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate(boundedPage(paginationOpts));
    const items = await Promise.all(
      page.page.map(async (n) => {
        if (await blocked(ctx, userId, n.actorId)) return null;
        const a = n.artworkId ? await ctx.db.get(n.artworkId) : null;
        if (n.artworkId && !a?.active) return null;
        return {
          _id: n._id,
          kind: n.kind,
          artworkId: n.artworkId,
          title: a?.title ?? null,
          read: n.read,
          createdAt: n.createdAt,
          actor: await artist(ctx, n.actorId),
        };
      }),
    );
    return { ...page, page: items.filter((n) => n !== null) };
  },
});
export const markNotificationsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("read"), false))
      .take(100);
    for (const row of rows) await ctx.db.patch(row._id, { read: true });
    return { ok: true };
  },
});

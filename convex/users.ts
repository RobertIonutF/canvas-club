import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { readCalendar } from "./calendar";
import {
  currentUser,
  artist,
  blocked,
  ensureProfile as ensure,
  level,
  profile,
  requireUser,
  text,
} from "./core";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUser(ctx);
    if (!userId) return null;
    const calendar = await readCalendar(ctx);
    const p = await profile(ctx, userId);
    const completed = await ctx.db
      .query("completions")
      .withIndex("by_user_week", (q) =>
        q.eq("userId", userId).eq("week", calendar.week),
      )
      .collect();
    return {
      userId,
      displayName: p?.displayName ?? "New artist",
      handle: p?.handle ?? "",
      bio: p?.bio ?? "",
      xp: p?.xp ?? 0,
      level: level(p?.xp ?? 0),
      weeklyGoal: p?.weeklyGoal ?? 3,
      completedThisWeek: completed.length,
    };
  },
});
export const viewer = me;
export const ensureProfile = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const p = await ensure(ctx, userId);
    return { ...p, level: level(p.xp) };
  },
});
export const update = mutation({
  args: {
    displayName: v.optional(v.string()),
    handle: v.optional(v.string()),
    bio: v.optional(v.string()),
    weeklyGoal: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const p = await ensure(ctx, userId);
    const patch: Partial<typeof p> = {};
    if (args.displayName !== undefined)
      patch.displayName = text(args.displayName, 40, "Name", 1);
    if (args.bio !== undefined) patch.bio = text(args.bio, 240, "Bio");
    if (args.handle !== undefined) {
      const handle = args.handle.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9_-]{2,23}$/.test(handle))
        throw new ConvexError(
          "Handle needs 3–24 lowercase letters, numbers, underscores or hyphens.",
        );
      const existing = await ctx.db
        .query("profiles")
        .withIndex("by_handle", (q) => q.eq("handle", handle))
        .unique();
      if (existing && existing.userId !== userId)
        throw new ConvexError("That handle is already in use.");
      patch.handle = handle;
    }
    if (args.weeklyGoal !== undefined) {
      if (
        !Number.isInteger(args.weeklyGoal) ||
        args.weeklyGoal < 1 ||
        args.weeklyGoal > 7
      )
        throw new ConvexError("Choose 1–7 sessions per week.");
      patch.weeklyGoal = args.weeklyGoal;
    }
    await ctx.db.patch(p._id, patch);
    return { ok: true };
  },
});
export const getByHandle = query({
  args: { handle: v.string() },
  handler: async (ctx, { handle }) => {
    const p = await ctx.db
      .query("profiles")
      .withIndex("by_handle", (q) =>
        q.eq("handle", handle.trim().toLowerCase()),
      )
      .unique();
    if (!p || (await blocked(ctx, await currentUser(ctx), p.userId)))
      return null;
    const viewer = await currentUser(ctx);
    const following = viewer
      ? await ctx.db
          .query("follows")
          .withIndex("by_pair", (q) =>
            q.eq("userId", viewer).eq("targetUserId", p.userId),
          )
          .unique()
      : null;
    return {
      ...(await artist(ctx, p.userId)),
      bio: p.bio,
      createdAt: p.createdAt,
      following: !!following,
    };
  },
});

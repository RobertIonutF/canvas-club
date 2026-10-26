import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { readCalendar } from "./calendar";
import {
  currentUser,
  dayKey,
  ensureProfile,
  level,
  ownProject,
  requireUser,
  weekKey,
} from "./core";

const prompts = [
  {
    starter: "tea-time",
    title: "A little tea break",
    prompt:
      "Draw a cup with a personality. Give it one tiny detail that tells a story.",
    description: "Warm shapes, your favorite colors, five peaceful minutes.",
  },
  {
    starter: "moon-garden",
    title: "A garden after dark",
    prompt:
      "Paint a little garden that only wakes up under the moon. Choose three colors.",
    description: "Try a dark background and one bright focal point.",
  },
  {
    starter: "friendly-monster",
    title: "A very friendly monster",
    prompt:
      "Draw a monster that would make an excellent neighbor. What does it carry?",
    description: "Play with shapes and expressions. Imperfect is welcome.",
  },
  {
    starter: "little-cabin",
    title: "Somewhere to slow down",
    prompt: "Sketch a tiny cabin and something welcoming outside its door.",
    description: "Build a scene from three simple shapes.",
  },
  {
    starter: "wildflowers",
    title: "A handful of wildflowers",
    prompt: "Make a little bouquet using at least three different brush sizes.",
    description: "Practice expressive marks without chasing perfection.",
  },
  {
    starter: "sunday-lemons",
    title: "A splash of yellow",
    prompt:
      "Paint a lemon and a shadow. Add an unexpected companion beside it.",
    description: "Notice the difference between a bright shape and its shadow.",
  },
];
function current(now: number) {
  const day = dayKey(now),
    week = weekKey(now);
  const offset = Math.floor(now / 86_400_000) % prompts.length;
  return prompts.map((p, i) => ({
    ...p,
    id:
      i === offset
        ? `daily:${day}:${p.starter}`
        : `weekly:${week}:${p.starter}`,
    kind: i === offset ? ("daily" as const) : ("weekly" as const),
    xp: 100,
  }));
}
export const list = query({
  args: {},
  handler: async (ctx) => {
    const calendar = await readCalendar(ctx);
    const userId = await currentUser(ctx);
    return await Promise.all(
      current(calendar.startAt).map(async (p) => {
        const done = userId
          ? await ctx.db
              .query("completions")
              .withIndex("by_user_challenge", (q) =>
                q.eq("userId", userId).eq("challengeId", p.id),
              )
              .unique()
          : null;
        return { ...p, completed: !!done, projectId: done?.projectId };
      }),
    );
  },
});
export const complete = mutation({
  args: { challengeId: v.string(), projectId: v.id("projects") },
  handler: async (ctx, { challengeId, projectId }) => {
    const userId = await requireUser(ctx);
    const p = await ownProject(ctx, projectId, userId);
    const prof = await ensureProfile(ctx, userId);
    if (!current(Date.now()).some((c) => c.id === challengeId))
      throw new ConvexError(
        "This challenge has ended. Choose one of the current prompts.",
      );
    const done = await ctx.db
      .query("completions")
      .withIndex("by_user_challenge", (q) =>
        q.eq("userId", userId).eq("challengeId", challengeId),
      )
      .unique();
    if (done)
      return {
        xpAwarded: 0,
        totalXp: prof.xp,
        level: level(prof.xp),
        alreadyCompleted: true,
      };
    if (!p.snapshotStorageId || !p.previewStorageId || p.version < 1)
      throw new ConvexError(
        "Save your finished drawing before completing a challenge.",
      );
    const used = await ctx.db
      .query("completions")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .first();
    if (used)
      throw new ConvexError(
        "This project already completed a challenge. Make a new piece for the next one.",
      );
    const today = await ctx.db
      .query("completions")
      .withIndex("by_user_day", (q) =>
        q.eq("userId", userId).eq("day", dayKey()),
      )
      .take(4);
    if (today.length >= 3)
      throw new ConvexError(
        "You've earned today's three practice rewards. You're welcome to keep creating.",
      );
    const xpAwarded = 100;
    const totalXp = prof.xp + xpAwarded;
    await ctx.db.insert("completions", {
      userId,
      projectId,
      challengeId,
      xp: xpAwarded,
      week: weekKey(),
      day: dayKey(),
      createdAt: Date.now(),
    });
    await ctx.db.patch(prof._id, { xp: totalXp });
    return {
      xpAwarded,
      totalXp,
      level: level(totalXp),
      alreadyCompleted: false,
    };
  },
});

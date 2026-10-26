import { ConvexError } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { dayKey, weekKey } from "./core";

const DAY_MS = 86_400_000;
export function computeDates(now: number) {
  const date = new Date(now);
  const startAt = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  return { startAt, day: dayKey(startAt), week: weekKey(startAt) };
}
export async function readCalendar(ctx: QueryCtx | MutationCtx) {
  const calendar = await ctx.db
    .query("calendar")
    .withIndex("by_key", (q) => q.eq("key", "current"))
    .unique();
  if (!calendar)
    throw new ConvexError(
      "Daily prompts are being prepared. Please try again in a moment.",
    );
  return calendar;
}
export const rollover = internalMutation({
  args: {},
  handler: async (ctx) => {
    const dates = computeDates(Date.now());
    const current = await ctx.db
      .query("calendar")
      .withIndex("by_key", (q) => q.eq("key", "current"))
      .unique();
    if (!current) {
      await ctx.db.insert("calendar", { key: "current", ...dates });
      return { changed: true, ...dates };
    }
    if (current.day === dates.day) return { changed: false, ...dates };
    await ctx.db.patch(current._id, dates);
    return { changed: true, ...dates };
  },
});

// A bounded regression fixture: no timestamp input, and it is impossible to
// change a production calendar through this function. Tests restore rollover
// in a finally block, including when an assertion fails.
export const previousDayForQa = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!process.env.CONVEX_SITE_URL?.startsWith("https://formal-gopher-359."))
      throw new ConvexError(
        "Calendar time fixtures are restricted to the Canvas Club development deployment.",
      );
    const current = await readCalendar(ctx);
    const dates = computeDates(Date.now() - DAY_MS);
    await ctx.db.patch(current._id, dates);
    return dates;
  },
});

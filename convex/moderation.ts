import { internalMutation, internalQuery } from "./_generated/server";
import { ConvexError, v } from "convex/values";

// These operations are intentionally INTERNAL. Only the deployment operator can
// invoke them through an authenticated Convex CLI/dashboard, never a web client.
export const pending = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 25 }) => {
    const count = Math.max(1, Math.min(50, Math.floor(limit)));
    const reports = await ctx.db
      .query("reports")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("asc")
      .take(count);
    return await Promise.all(
      reports.map(async (report) => {
        const artwork = await ctx.db.get(report.artworkId);
        return {
          ...report,
          artwork: artwork
            ? {
                title: artwork.title,
                description: artwork.description,
                active: artwork.active,
                artistUserId: artwork.userId,
                previewUrl: artwork.active
                  ? await ctx.storage.getUrl(artwork.previewStorageId)
                  : null,
              }
            : null,
        };
      }),
    );
  },
});
export const resolve = internalMutation({
  args: {
    reportId: v.id("reports"),
    decision: v.union(v.literal("hide"), v.literal("dismiss")),
    note: v.string(),
  },
  handler: async (ctx, { reportId, decision, note }) => {
    const report = await ctx.db.get(reportId);
    if (!report) throw new ConvexError("Report unavailable.");
    const explanation = note.trim();
    if (explanation.length < 5 || explanation.length > 1000)
      throw new ConvexError(
        "Record a review explanation of 5–1000 characters.",
      );
    const now = Date.now();
    if (decision === "hide") {
      const artwork = await ctx.db.get(report.artworkId);
      if (artwork) {
        if (artwork.active) await ctx.storage.delete(artwork.previewStorageId);
        await ctx.db.patch(artwork._id, { active: false, updatedAt: now });
        const project = await ctx.db.get(artwork.projectId);
        if (project)
          await ctx.db.patch(project._id, {
            visibility: "private",
            moderatedAt: now,
            moderationNote: explanation,
          });
      }
    }
    await ctx.db.patch(reportId, {
      status: decision === "hide" ? "resolved" : "dismissed",
      reviewedAt: now,
      reviewNote: explanation,
    });
    return { ok: true, decision };
  },
});
export const release = internalMutation({
  args: { projectId: v.id("projects"), note: v.string() },
  handler: async (ctx, { projectId, note }) => {
    const project = await ctx.db.get(projectId);
    if (!project) throw new ConvexError("Project unavailable.");
    if (note.trim().length < 5 || note.length > 1000)
      throw new ConvexError("Record an appeal/review explanation.");
    await ctx.db.patch(projectId, {
      moderatedAt: undefined,
      moderationNote: note.trim(),
    });
    return {
      ok: true,
      message:
        "Sharing is allowed again; the artist decides whether to publish.",
    };
  },
});

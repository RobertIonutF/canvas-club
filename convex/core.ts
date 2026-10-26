import { getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";
import { anyApi } from "convex/server";
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx, ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export type ReadCtx = QueryCtx | MutationCtx;
export async function currentUser(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const userId = await getAuthUserId(ctx);
  const sessionId = await getAuthSessionId(ctx);
  if (!userId || !sessionId) return null;
  if ("db" in ctx) {
    const session = await ctx.db.get(sessionId);
    return session &&
      session.userId === userId &&
      session.expirationTime > Date.now()
      ? userId
      : null;
  }
  return (await ctx.runQuery(anyApi.recovery.sessionActive, {
    userId,
    sessionId,
  }))
    ? userId
    : null;
}
export async function requireUser(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const userId = await currentUser(ctx);
  if (!userId) throw new ConvexError("Sign in to continue.");
  return userId;
}
export function text(value: string, max: number, label: string, min = 0) {
  const clean = value.trim();
  if (clean.length < min || clean.length > max)
    throw new ConvexError(
      `${label} must be ${min ? `${min}–` : "at most "}${max} characters.`,
    );
  return clean;
}
export const level = (xp: number) =>
  Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
export const dayKey = (now = Date.now()) =>
  new Date(now).toISOString().slice(0, 10);
export function sha256Hex(value: string) {
  if (/^[a-fA-F0-9]{64}$/.test(value)) return value.toLowerCase();
  try {
    return Array.from(
      atob(value.replaceAll("-", "+").replaceAll("_", "/")),
      (c) => c.charCodeAt(0).toString(16).padStart(2, "0"),
    ).join("");
  } catch {
    return "";
  }
}
export function weekKey(now = Date.now()) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
export async function profile(ctx: ReadCtx, userId: Id<"users">) {
  return await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}
export async function ensureProfile(ctx: MutationCtx, userId: Id<"users">) {
  const existing = await profile(ctx, userId);
  if (existing) return existing;
  const id = await ctx.db.insert("profiles", {
    userId,
    displayName: "New artist",
    handle: `artist-${String(userId).slice(-16)}`,
    bio: "",
    xp: 0,
    weeklyGoal: 3,
    createdAt: Date.now(),
  });
  return (await ctx.db.get(id))!;
}
export async function artist(ctx: ReadCtx, userId: Id<"users">) {
  const p = await profile(ctx, userId);
  return {
    userId,
    displayName: p?.displayName ?? "Artist",
    handle: p?.handle ?? "",
    xp: p?.xp ?? 0,
    level: level(p?.xp ?? 0),
  };
}
export async function ownProject(
  ctx: ReadCtx,
  projectId: Id<"projects">,
  userId: Id<"users">,
  allowTrash = false,
) {
  const p = await ctx.db.get(projectId);
  if (!p || p.userId !== userId || (!allowTrash && p.deletedAt !== undefined))
    throw new ConvexError("Project unavailable.");
  return p;
}
export async function ownFile(
  ctx: ReadCtx,
  storageId: Id<"_storage">,
  userId: Id<"users">,
  kind?: "snapshot" | "preview" | "generated",
) {
  const file = await ctx.db
    .query("files")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .unique();
  if (!file || file.userId !== userId || (kind && file.kind !== kind))
    throw new ConvexError("File unavailable.");
  return file;
}
export async function blocked(
  ctx: ReadCtx,
  a: Id<"users"> | null,
  b: Id<"users">,
) {
  if (!a || a === b) return false;
  const forward = await ctx.db
    .query("blocks")
    .withIndex("by_pair", (q) => q.eq("userId", a).eq("targetUserId", b))
    .unique();
  if (forward) return true;
  return !!(await ctx.db
    .query("blocks")
    .withIndex("by_pair", (q) => q.eq("userId", b).eq("targetUserId", a))
    .unique());
}
export async function artwork(
  ctx: ReadCtx,
  a: Doc<"artworks">,
  viewerId: Id<"users"> | null,
) {
  if (!a.active || (await blocked(ctx, viewerId, a.userId))) return null;
  const like = viewerId
    ? await ctx.db
        .query("likes")
        .withIndex("by_artwork_user", (q) =>
          q.eq("artworkId", a._id).eq("userId", viewerId),
        )
        .unique()
    : null;
  return {
    _id: a._id,
    title: a.title,
    description: a.description,
    width: a.width,
    height: a.height,
    medium: a.medium,
    imageUrl: await ctx.storage.getUrl(a.previewStorageId),
    createdAt: a.createdAt,
    likesCount: a.likesCount,
    commentsCount: a.commentsCount,
    likedByMe: !!like,
    artist: await artist(ctx, a.userId),
  };
}
export async function visibleArtwork(
  ctx: ReadCtx,
  artworkId: Id<"artworks">,
  viewerId: Id<"users"> | null,
) {
  const a = await ctx.db.get(artworkId);
  if (!a || !a.active || (await blocked(ctx, viewerId, a.userId)))
    throw new ConvexError("Artwork unavailable.");
  return a;
}
export async function consume(
  ctx: MutationCtx,
  key: string,
  limit: number,
  bytes = 0,
  byteLimit = Number.MAX_SAFE_INTEGER,
) {
  const row = await ctx.db
    .query("usage")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if ((row?.count ?? 0) >= limit || (row?.bytes ?? 0) + bytes > byteLimit)
    throw new ConvexError("You've reached this limit. Please try again later.");
  if (row)
    await ctx.db.patch(row._id, {
      count: row.count + 1,
      bytes: (row.bytes ?? 0) + bytes,
    });
  else await ctx.db.insert("usage", { key, count: 1, bytes });
}
export function boundedPage<T extends { numItems: number }>(opts: T): T {
  if (
    !Number.isInteger(opts.numItems) ||
    opts.numItems < 1 ||
    opts.numItems > 48
  )
    throw new ConvexError("Request 1–48 items at a time.");
  return opts;
}
export async function notify(
  ctx: MutationCtx,
  userId: Id<"users">,
  actorId: Id<"users">,
  kind: "comment" | "like" | "follow",
  artworkId?: Id<"artworks">,
) {
  if (userId !== actorId)
    await ctx.db.insert("notifications", {
      userId,
      actorId,
      kind,
      artworkId,
      read: false,
      createdAt: Date.now(),
    });
}

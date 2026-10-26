import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { anyApi } from "convex/server";
import { ConvexError, v } from "convex/values";
import { consume, dayKey, ownFile, requireUser, sha256Hex } from "./core";

// Registration is server-only: a client cannot claim another artist's file ID.
export const upload = action({
  args: {
    data: v.bytes(),
    kind: v.union(v.literal("snapshot"), v.literal("preview")),
  },
  handler: async (ctx, { data, kind }) => {
    const userId = await requireUser(ctx);
    const bytes = new Uint8Array(data);
    const max = kind === "snapshot" ? 5 * 1024 * 1024 : 3 * 1024 * 1024;
    if (!bytes.length || bytes.length > max)
      throw new ConvexError(`This ${kind} is too large.`);
    if (kind === "snapshot") {
      try {
        const parsed = JSON.parse(new TextDecoder().decode(bytes));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          throw new Error();
      } catch {
        throw new ConvexError(
          "The project file must contain a valid JSON object.",
        );
      }
    } else {
      if (
        bytes.length < 24 ||
        [137, 80, 78, 71, 13, 10, 26, 10].some((value, i) => bytes[i] !== value)
      )
        throw new ConvexError("Preview must be a PNG image.");
      const view = new DataView(data);
      const width = view.getUint32(16),
        height = view.getUint32(20);
      if (!width || !height || width > 4096 || height > 4096)
        throw new ConvexError("Preview dimensions must be 1–4096 pixels.");
    }
    await ctx.runMutation(anyApi.files.reserveUpload, {
      userId,
      size: bytes.length,
    });
    const storageId = await ctx.storage.store(
      new Blob([data], {
        type: kind === "snapshot" ? "application/json" : "image/png",
      }),
    );
    try {
      await ctx.runMutation(anyApi.files.recordOwned, {
        userId,
        storageId,
        kind,
        size: bytes.length,
      });
      return { storageId };
    } catch (error) {
      await ctx.storage.delete(storageId);
      throw error;
    }
  },
});
export const reserveUpload = internalMutation({
  args: { userId: v.id("users"), size: v.number() },
  handler: async (ctx, { userId, size }) => {
    const files = await ctx.db
      .query("files")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(1001);
    if (
      files.length >= 1000 ||
      files.reduce((sum, f) => sum + f.size, 0) + size > 250 * 1024 * 1024
    )
      throw new ConvexError("Your beta storage allowance is full (250 MB).");
    await consume(
      ctx,
      `uploads:${userId}:${dayKey()}`,
      120,
      size,
      250 * 1024 * 1024,
    );
  },
});
export const recordOwned = internalMutation({
  args: {
    userId: v.id("users"),
    storageId: v.id("_storage"),
    kind: v.union(
      v.literal("snapshot"),
      v.literal("preview"),
      v.literal("generated"),
    ),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    if (
      await ctx.db
        .query("files")
        .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
        .unique()
    )
      throw new ConvexError("File is already registered.");
    return await ctx.db.insert("files", { ...args, createdAt: Date.now() });
  },
});
export const getUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const userId = await requireUser(ctx);
    await ownFile(ctx, storageId, userId);
    return await ctx.storage.getUrl(storageId);
  },
});

export const createUpload = mutation({
  args: {
    kind: v.union(v.literal("snapshot"), v.literal("preview")),
    sha256: v.string(),
    size: v.optional(v.number()),
  },
  handler: async (ctx, { kind, sha256, size }) => {
    const userId = await requireUser(ctx);
    if (!/^[a-fA-F0-9]{64}$/.test(sha256))
      throw new ConvexError("A SHA-256 content digest is required.");
    const max = kind === "snapshot" ? 40 * 1024 * 1024 : 3 * 1024 * 1024;
    if (
      size !== undefined &&
      (!Number.isInteger(size) || size < 1 || size > max)
    )
      throw new ConvexError("This file exceeds the cloud save limit.");
    await consume(
      ctx,
      `uploadGrants:${userId}:${dayKey()}`,
      120,
      size ?? 0,
      250 * 1024 * 1024,
    );
    const grantId = await ctx.db.insert("uploadGrants", {
      userId,
      kind,
      sha256: sha256.toLowerCase(),
      size,
      expiresAt: Date.now() + 10 * 60_000,
      consumed: false,
    });
    return { grantId, uploadUrl: await ctx.storage.generateUploadUrl() };
  },
});
export const checkGrant = internalQuery({
  args: {
    userId: v.id("users"),
    grantId: v.id("uploadGrants"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, { userId, grantId, storageId }) => {
    const grant = await ctx.db.get(grantId);
    if (
      !grant ||
      grant.userId !== userId ||
      grant.consumed ||
      grant.expiresAt < Date.now()
    )
      throw new ConvexError("This upload has expired. Please save again.");
    const registered = await ctx.db
      .query("files")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .unique();
    if (registered) throw new ConvexError("File is already registered.");
    const meta = await ctx.db.system.get(storageId);
    const max = grant.kind === "snapshot" ? 40 * 1024 * 1024 : 3 * 1024 * 1024;
    if (
      !meta ||
      sha256Hex(meta.sha256) !== grant.sha256 ||
      meta.size < 1 ||
      meta.size > max ||
      (grant.size !== undefined && meta.size !== grant.size)
    )
      throw new ConvexError("The uploaded file did not match this save.");
    const expected =
      grant.kind === "snapshot" ? "application/json" : "image/png";
    if (meta.contentType !== expected)
      throw new ConvexError(`Upload as ${expected}.`);
    return { kind: grant.kind, size: meta.size };
  },
});
export const commitUpload = action({
  args: { grantId: v.id("uploadGrants"), storageId: v.id("_storage") },
  handler: async (ctx, { grantId, storageId }) => {
    const userId = await requireUser(ctx);
    const info = await ctx.runQuery(anyApi.files.checkGrant, {
      userId,
      grantId,
      storageId,
    });
    const blob = await ctx.storage.get(storageId);
    if (!blob) throw new ConvexError("Uploaded file is unavailable.");
    if (info.kind === "snapshot") {
      try {
        const parsed = JSON.parse(await blob.text());
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          throw new Error();
      } catch {
        throw new ConvexError("The saved project is not valid JSON.");
      }
    } else {
      const data = await blob.arrayBuffer();
      const b = new Uint8Array(data);
      if (
        b.length < 24 ||
        [137, 80, 78, 71, 13, 10, 26, 10].some((n, i) => b[i] !== n)
      )
        throw new ConvexError("Invalid PNG preview.");
      const d = new DataView(data);
      if (
        !d.getUint32(16) ||
        !d.getUint32(20) ||
        d.getUint32(16) > 4096 ||
        d.getUint32(20) > 4096
      )
        throw new ConvexError("Preview dimensions exceed 4096 pixels.");
    }
    await ctx.runMutation(anyApi.files.finalizeUpload, {
      userId,
      grantId,
      storageId,
    });
    return { storageId };
  },
});
export const finalizeUpload = internalMutation({
  args: {
    userId: v.id("users"),
    grantId: v.id("uploadGrants"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, { userId, grantId, storageId }) => {
    const grant = await ctx.db.get(grantId);
    const meta = await ctx.db.system.get(storageId);
    if (
      !grant ||
      grant.userId !== userId ||
      grant.consumed ||
      grant.expiresAt < Date.now() ||
      !meta ||
      sha256Hex(meta.sha256) !== grant.sha256
    )
      throw new ConvexError("Upload is unavailable or already saved.");
    if (
      await ctx.db
        .query("files")
        .withIndex("by_storage", (q) => q.eq("storageId", storageId))
        .unique()
    )
      throw new ConvexError("File is already registered.");
    const all = await ctx.db
      .query("files")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(1001);
    if (
      all.length >= 1000 ||
      all.reduce((sum, f) => sum + f.size, 0) + meta.size > 250 * 1024 * 1024
    )
      throw new ConvexError("Your beta storage allowance is full (250 MB).");
    await ctx.db.insert("files", {
      userId,
      storageId,
      kind: grant.kind,
      size: meta.size,
      createdAt: Date.now(),
    });
    await ctx.db.patch(grantId, { consumed: true });
  },
});

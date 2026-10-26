import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import {
  getAuthSessionId,
  invalidateSessions,
  modifyAccountCredentials,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { anyApi } from "convex/server";
import { ConvexError, v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { consume, currentUser, dayKey, requireUser } from "./core";

const INVALID = "That email and recovery code could not be verified.";
const normalizeCode = (value: string) =>
  value.replace(/[\s-]/g, "").toLowerCase();
async function digest(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function passwordRequirements(password: string) {
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 128
  )
    throw new ConvexError("Use a password with 8–128 characters.");
}
export const Recovery = ConvexCredentials({
  id: "recovery",
  authorize: async (params, ctx) => {
    const email =
      typeof params.email === "string" ? params.email.trim().toLowerCase() : "";
    const code =
      typeof params.code === "string" ? normalizeCode(params.code) : "";
    const newPassword =
      typeof params.newPassword === "string" ? params.newPassword : "";
    if (
      !email ||
      email.length > 254 ||
      !/^[a-f0-9]{32}$/.test(code) ||
      newPassword.length < 8 ||
      newPassword.length > 128
    )
      throw new ConvexError(INVALID);
    const codeHash = await digest(`canvas-club-recovery-v1:${code}`);
    const emailHash = await digest(email);
    // A failed attempt returns null from a mutation so its rate-limit write
    // commits. Throwing inside that mutation would roll back the protection.
    const claim = await ctx.runMutation(anyApi.recovery.claimCode, {
      emailKey: email,
      emailHash,
      codeHash,
    });
    if (!claim) throw new ConvexError(INVALID);
    try {
      await modifyAccountCredentials(ctx, {
        provider: "password",
        account: { id: claim.accountId, secret: newPassword },
      });
      await invalidateSessions(ctx, { userId: claim.userId });
    } catch {
      throw new ConvexError(
        "Recovery could not finish. Try signing in with your new password, or use another saved recovery code.",
      );
    }
    // Convex Auth creates the new session and tokens after authorize returns.
    return { userId: claim.userId };
  },
});
export const sessionActive = internalQuery({
  args: { userId: v.id("users"), sessionId: v.id("authSessions") },
  handler: async (ctx, { userId, sessionId }) => {
    const session = await ctx.db.get(sessionId);
    return (
      !!session &&
      session.userId === userId &&
      session.expirationTime > Date.now()
    );
  },
});
export const accountForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", userId).eq("provider", "password"),
      )
      .unique();
    return account
      ? {
          accountId: account.providerAccountId,
          emailKey: account.providerAccountId.trim().toLowerCase(),
        }
      : null;
  },
});
export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUser(ctx);
    if (!userId) return null;
    const codes = await ctx.db
      .query("recoveryCodes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return {
      configured: codes.length > 0,
      remaining: codes.filter((c) => c.usedAt === undefined).length,
      lastGeneratedAt: codes[0]?.createdAt ?? null,
    };
  },
});
export const generate = action({
  args: { currentPassword: v.string() },
  handler: async (ctx, { currentPassword }) => {
    const userId = await requireUser(ctx);
    const sessionId = await getAuthSessionId(ctx);
    if (!sessionId)
      throw new ConvexError("Sign in again to create recovery codes.");
    if (!currentPassword || currentPassword.length > 1024)
      throw new ConvexError("Your current password could not be verified.");
    const account = await ctx.runQuery(anyApi.recovery.accountForUser, {
      userId,
    });
    if (!account)
      throw new ConvexError(
        "This account cannot create password recovery codes.",
      );
    try {
      const verified = await retrieveAccount(ctx, {
        provider: "password",
        account: { id: account.accountId, secret: currentPassword },
      });
      if (!verified || verified.user._id !== userId) throw new Error();
    } catch {
      throw new ConvexError("Your current password could not be verified.");
    }
    const codes = Array.from({ length: 6 }, () => {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      const raw = Array.from(bytes, (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      return raw.match(/.{4}/g)!.join("-");
    });
    const hashes = await Promise.all(
      codes.map((code) =>
        digest(`canvas-club-recovery-v1:${normalizeCode(code)}`),
      ),
    );
    const generatedAt = await ctx.runMutation(anyApi.recovery.replaceCodes, {
      userId,
      sessionId,
      emailKey: account.emailKey,
      hashes,
    });
    return { codes, generatedAt };
  },
});
export const replaceCodes = internalMutation({
  args: {
    userId: v.id("users"),
    sessionId: v.id("authSessions"),
    emailKey: v.string(),
    hashes: v.array(v.string()),
  },
  handler: async (ctx, { userId, sessionId, emailKey, hashes }) => {
    const session = await ctx.db.get(sessionId);
    if (
      !session ||
      session.userId !== userId ||
      session.expirationTime <= Date.now()
    )
      throw new ConvexError("Sign in again to create recovery codes.");
    if (
      hashes.length !== 6 ||
      new Set(hashes).size !== 6 ||
      hashes.some((hash) => !/^[a-f0-9]{64}$/.test(hash))
    )
      throw new ConvexError("Recovery code generation failed.");
    await consume(ctx, `recovery-rotation:${userId}:${dayKey()}`, 10);
    const old = await ctx.db
      .query("recoveryCodes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const code of old) await ctx.db.delete(code._id);
    const createdAt = Date.now();
    for (const codeHash of hashes)
      await ctx.db.insert("recoveryCodes", {
        userId,
        emailKey,
        codeHash,
        createdAt,
      });
    return createdAt;
  },
});
export const claimCode = internalMutation({
  args: { emailKey: v.string(), emailHash: v.string(), codeHash: v.string() },
  handler: async (ctx, { emailKey, emailHash, codeHash }) => {
    const hour = new Date().toISOString().slice(0, 13);
    const key = `recovery-attempt:${emailHash}:${hour}`;
    const rate = await ctx.db
      .query("usage")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if ((rate?.count ?? 0) >= 10) return null;
    if (rate) await ctx.db.patch(rate._id, { count: rate.count + 1 });
    else await ctx.db.insert("usage", { key, count: 1 });
    const globalKey = `recovery-attempt:global:${hour}`;
    const global = await ctx.db
      .query("usage")
      .withIndex("by_key", (q) => q.eq("key", globalKey))
      .unique();
    if ((global?.count ?? 0) >= 200) return null;
    if (global) await ctx.db.patch(global._id, { count: global.count + 1 });
    else await ctx.db.insert("usage", { key: globalKey, count: 1 });
    const code = await ctx.db
      .query("recoveryCodes")
      .withIndex("by_email_hash", (q) =>
        q.eq("emailKey", emailKey).eq("codeHash", codeHash),
      )
      .unique();
    if (!code || code.usedAt !== undefined) return null;
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", code.userId).eq("provider", "password"),
      )
      .unique();
    if (!account || account.providerAccountId.trim().toLowerCase() !== emailKey)
      return null;
    await ctx.db.patch(code._id, { usedAt: Date.now() });
    return { userId: code.userId, accountId: account.providerAccountId };
  },
});

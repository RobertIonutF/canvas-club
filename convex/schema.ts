import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// The schema is normally optional, but Convex Auth
// requires indexes defined on `authTables`.
export default defineSchema({
  ...authTables,
  calendar: defineTable({
    key: v.literal("current"),
    startAt: v.number(),
    day: v.string(),
    week: v.string(),
  }).index("by_key", ["key"]),
  profiles: defineTable({
    userId: v.id("users"),
    displayName: v.string(),
    handle: v.string(),
    bio: v.string(),
    xp: v.number(),
    weeklyGoal: v.number(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_handle", ["handle"]),
  recoveryCodes: defineTable({
    userId: v.id("users"),
    emailKey: v.string(),
    codeHash: v.string(),
    createdAt: v.number(),
    usedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_email_hash", ["emailKey", "codeHash"]),
  files: defineTable({
    userId: v.id("users"),
    storageId: v.id("_storage"),
    kind: v.union(
      v.literal("snapshot"),
      v.literal("preview"),
      v.literal("generated"),
    ),
    size: v.number(),
    createdAt: v.number(),
  })
    .index("by_storage", ["storageId"])
    .index("by_user", ["userId"]),
  uploadGrants: defineTable({
    userId: v.id("users"),
    kind: v.union(v.literal("snapshot"), v.literal("preview")),
    sha256: v.string(),
    size: v.optional(v.number()),
    expiresAt: v.number(),
    consumed: v.boolean(),
  }).index("by_user", ["userId"]),
  projects: defineTable({
    userId: v.id("users"),
    title: v.string(),
    description: v.string(),
    width: v.number(),
    height: v.number(),
    medium: v.union(
      v.literal("manual"),
      v.literal("assisted"),
      v.literal("generated"),
    ),
    snapshotStorageId: v.optional(v.id("_storage")),
    previewStorageId: v.optional(v.id("_storage")),
    version: v.number(),
    isPinned: v.boolean(),
    visibility: v.union(v.literal("private"), v.literal("public")),
    artworkId: v.optional(v.id("artworks")),
    deletedAt: v.optional(v.number()),
    moderatedAt: v.optional(v.number()),
    moderationNote: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_updated", ["userId", "updatedAt"])
    .index("by_snapshot", ["snapshotStorageId"])
    .index("by_preview", ["previewStorageId"]),
  revisions: defineTable({
    projectId: v.id("projects"),
    userId: v.id("users"),
    version: v.number(),
    snapshotStorageId: v.id("_storage"),
    previewStorageId: v.id("_storage"),
    medium: v.union(
      v.literal("manual"),
      v.literal("assisted"),
      v.literal("generated"),
    ),
    title: v.string(),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId", "createdAt"])
    .index("by_snapshot", ["snapshotStorageId"])
    .index("by_preview", ["previewStorageId"]),
  artworks: defineTable({
    userId: v.id("users"),
    projectId: v.id("projects"),
    title: v.string(),
    description: v.string(),
    width: v.number(),
    height: v.number(),
    medium: v.union(
      v.literal("manual"),
      v.literal("assisted"),
      v.literal("generated"),
    ),
    previewStorageId: v.id("_storage"),
    publishedVersion: v.number(),
    active: v.boolean(),
    likesCount: v.number(),
    commentsCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_active_created", ["active", "createdAt"])
    .index("by_user_active", ["userId", "active", "createdAt"])
    .index("by_project", ["projectId"])
    .index("by_active_medium", ["active", "medium", "createdAt"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["active", "medium"],
    }),
  likes: defineTable({
    userId: v.id("users"),
    artworkId: v.id("artworks"),
    createdAt: v.number(),
  }).index("by_artwork_user", ["artworkId", "userId"]),
  comments: defineTable({
    userId: v.id("users"),
    artworkId: v.id("artworks"),
    body: v.string(),
    createdAt: v.number(),
  })
    .index("by_artwork", ["artworkId", "createdAt"])
    .index("by_user_created", ["userId", "createdAt"]),
  follows: defineTable({
    userId: v.id("users"),
    targetUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_pair", ["userId", "targetUserId"])
    .index("by_target", ["targetUserId"]),
  blocks: defineTable({
    userId: v.id("users"),
    targetUserId: v.id("users"),
    createdAt: v.number(),
  }).index("by_pair", ["userId", "targetUserId"]),
  reports: defineTable({
    userId: v.id("users"),
    artworkId: v.id("artworks"),
    reason: v.string(),
    createdAt: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("resolved"),
      v.literal("dismissed"),
    ),
    reviewedAt: v.optional(v.number()),
    reviewNote: v.optional(v.string()),
  })
    .index("by_user_artwork", ["userId", "artworkId"])
    .index("by_status", ["status", "createdAt"]),
  notifications: defineTable({
    userId: v.id("users"),
    actorId: v.id("users"),
    artworkId: v.optional(v.id("artworks")),
    kind: v.union(v.literal("comment"), v.literal("like"), v.literal("follow")),
    read: v.boolean(),
    createdAt: v.number(),
  }).index("by_user", ["userId", "createdAt"]),
  completions: defineTable({
    userId: v.id("users"),
    projectId: v.id("projects"),
    challengeId: v.string(),
    xp: v.number(),
    week: v.string(),
    day: v.string(),
    createdAt: v.number(),
  })
    .index("by_user_challenge", ["userId", "challengeId"])
    .index("by_project", ["projectId"])
    .index("by_user_week", ["userId", "week"])
    .index("by_user_day", ["userId", "day"]),
  usage: defineTable({
    key: v.string(),
    count: v.number(),
    bytes: v.optional(v.number()),
  }).index("by_key", ["key"]),
  imageJobs: defineTable({
    userId: v.id("users"),
    projectId: v.id("projects"),
    operation: v.union(v.literal("generate"), v.literal("edit")),
    state: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    day: v.string(),
    storageId: v.optional(v.id("_storage")),
    error: v.optional(v.string()),
    usageJson: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    decision: v.optional(
      v.union(v.literal("accepted"), v.literal("discarded")),
    ),
    decidedAt: v.optional(v.number()),
  })
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_project_created", ["projectId", "createdAt"]),
});

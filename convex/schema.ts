import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  feedback: defineTable({
    author: v.optional(v.string()),
    comment: v.string(),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),
});

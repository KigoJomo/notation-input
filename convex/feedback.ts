import { v } from "convex/values";

import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("feedback").withIndex("by_createdAt").order("desc").take(100);
  },
});

export const create = mutation({
  args: {
    author: v.optional(v.string()),
    comment: v.string(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("feedback", {
      ...args,
      author: args.author?.trim() || undefined,
      createdAt: Date.now(),
    });

    return { id };
  },
});

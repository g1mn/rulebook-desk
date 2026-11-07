import { defineAction, fail } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { assertPublicUrl } from "../server/lib/rulebook/fetch-page.js";
import { refreshOut } from "../server/lib/rulebook/schemas.js";
import { refreshSource } from "../server/lib/rulebook/service.js";

export default defineAction({
  description:
    "Start tracking a contest, grant or program: create a rulebook from 1-5 public rule page URLs and fetch each page's text right away. Next, read the pages with read-source and save deadlines/requirements with save-facts.",
  schema: z.object({
    name: z
      .string()
      .min(1)
      .max(120)
      .describe('Short name, e.g. "Agent-Native Hackathon"'),
    urls: z
      .array(z.string().url())
      .min(1)
      .max(5)
      .describe("Public http(s) URLs of the rules, FAQ or submission pages"),
    asOf: z
      .string()
      .regex(/^\d{8}(\d{6})?$/)
      .optional()
      .describe(
        'Optional Wayback timestamp "YYYYMMDD": start from the Internet Archive copy of each page at that date (e.g. the version you read when you entered) instead of today\'s page',
      ),
  }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    sources: z.array(refreshOut),
    message: z.string(),
    nextRequiredAction: z.string().optional(),
  }),
  link: ({ result }) => ({
    url: buildDeepLink({
      view: "rulebook",
      to: `/desk/${encodeURIComponent(result.id)}`,
      params: { rulebookId: result.id },
    }),
    label: `Open ${result.name}`,
  }),
  run: async (args, ctx) => {
    const ownerEmail =
      ctx?.userEmail ?? fail("Sign in to track rules.", { statusCode: 401 });
    const orgId = ctx?.orgId ?? null;
    const urls = [...new Set(args.urls.map((u) => assertPublicUrl(u).toString()))];
    const db = getDb();
    const now = new Date().toISOString();
    const rulebook = {
      id: crypto.randomUUID(),
      name: args.name.trim(),
      notes: null,
      createdAt: now,
      updatedAt: now,
      ownerEmail,
      orgId,
      visibility: orgId ? ("org" as const) : ("private" as const),
    };
    await db.insert(schema.rulebooks).values(rulebook);
    const sourceRows = urls.map((url) => ({
      id: crypto.randomUUID(),
      rulebookId: rulebook.id,
      url,
      title: null,
      currentSnapshotId: null,
      lastCheckedAt: null,
      lastChangedAt: null,
      lastStatus: "pending" as const,
      lastError: null,
      ownerEmail,
      orgId,
      createdAt: now,
    }));
    await db.insert(schema.sources).values(sourceRows);
    const results = [];
    for (const source of sourceRows) {
      results.push(await refreshSource(source, rulebook, { asOf: args.asOf }));
    }
    const ok = results.filter((r) => r.status !== "error").length;
    return {
      id: rulebook.id,
      name: rulebook.name,
      sources: results,
      message: `Created "${rulebook.name}" and fetched ${ok} of ${results.length} page(s).`,
      ...(ok ? { nextRequiredAction: "read-source" } : {}),
    };
  },
});

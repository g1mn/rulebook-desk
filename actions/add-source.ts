import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { assertPublicUrl } from "../server/lib/rulebook/fetch-page.js";
import { refreshOut } from "../server/lib/rulebook/schemas.js";
import { refreshSource, requireRulebook } from "../server/lib/rulebook/service.js";

export default defineAction({
  description:
    "Add another public page (FAQ, submission form, updates post) to an existing rulebook and fetch its text. Fails with source_exists (409) if the URL is already tracked.",
  schema: z.object({
    rulebookId: z.string().describe("Rulebook id"),
    url: z.string().url().describe("Public http(s) URL to track"),
    asOf: z
      .string()
      .regex(/^\d{8}(\d{6})?$/)
      .optional()
      .describe('Optional Wayback timestamp "YYYYMMDD": start from the archived copy'),
  }),
  outputSchema: refreshOut,
  run: async (args, ctx) => {
    const rulebook = await requireRulebook(args.rulebookId, "editor");
    const url = assertPublicUrl(args.url).toString();
    const db = getDb();
    const [existing] = await db
      .select({ id: schema.sources.id })
      .from(schema.sources)
      .where(
        and(
          eq(schema.sources.rulebookId, rulebook.id),
          eq(schema.sources.url, url),
        ),
      )
      .limit(1);
    if (existing)
      fail("That page is already tracked in this rulebook.", {
        errorCode: "source_exists",
        statusCode: 409,
        details: { sourceId: existing.id },
      });
    const count = await db
      .select({ id: schema.sources.id })
      .from(schema.sources)
      .where(eq(schema.sources.rulebookId, rulebook.id))
      .limit(20);
    if (count.length >= 10)
      fail("A rulebook can track up to 10 pages.", {
        errorCode: "too_many_sources",
        statusCode: 409,
      });
    const source = {
      id: crypto.randomUUID(),
      rulebookId: rulebook.id,
      url,
      title: null,
      currentSnapshotId: null,
      lastCheckedAt: null,
      lastChangedAt: null,
      lastStatus: "pending" as const,
      lastError: null,
      ownerEmail: ctx?.userEmail ?? rulebook.ownerEmail,
      orgId: rulebook.orgId,
      createdAt: new Date().toISOString(),
    };
    await db.insert(schema.sources).values(source);
    return refreshSource(source, rulebook, { asOf: args.asOf });
  },
});

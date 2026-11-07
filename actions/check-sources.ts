import { defineAction } from "@agent-native/core/action";
import { accessFilter } from "@agent-native/core/sharing";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { refreshOut } from "../server/lib/rulebook/schemas.js";
import {
  refreshSource,
  requireRulebook,
  requireSource,
} from "../server/lib/rulebook/service.js";

export default defineAction({
  description:
    "Re-fetch tracked pages and detect changes. With no ids it checks every rulebook the user can edit (use this in the daily automation). A changed page stores a new snapshot, records which paragraphs were added/removed, and marks facts stale when their quote disappeared. Pass asOf (Wayback timestamp) to load the Internet Archive copy from that time instead of the live page, to replay how a page's rules changed.",
  schema: z.object({
    rulebookId: z.string().optional().describe("Limit to one rulebook"),
    sourceId: z.string().optional().describe("Limit to one page"),
    asOf: z
      .string()
      .regex(/^\d{8}(\d{6})?$/)
      .optional()
      .describe(
        'Optional Wayback timestamp "YYYYMMDD" or "YYYYMMDDhhmmss": load the Internet Archive copy from then instead of the live page',
      ),
  }),
  outputSchema: z.object({
    results: z.array(refreshOut),
    message: z.string(),
  }),
  searchHints: ["drift", "recheck rules", "what changed", "compare archive"],
  run: async (args) => {
    const db = getDb();
    let pairs: {
      source: typeof schema.sources.$inferSelect;
      rulebook: typeof schema.rulebooks.$inferSelect;
    }[] = [];
    if (args.sourceId) {
      pairs = [await requireSource(args.sourceId, "editor")];
    } else {
      const books = args.rulebookId
        ? [await requireRulebook(args.rulebookId, "editor")]
        : await db
            .select()
            .from(schema.rulebooks)
            .where(accessFilter(schema.rulebooks, schema.rulebookShares, undefined, "editor"))
            .orderBy(desc(schema.rulebooks.updatedAt))
            .limit(50);
      if (!books.length) return { results: [], message: "No rulebooks to check." };
      const srcRows = await db
        .select()
        .from(schema.sources)
        .where(
          books.length === 1
            ? eq(schema.sources.rulebookId, books[0]!.id)
            : inArray(
                schema.sources.rulebookId,
                books.map((b) => b.id),
              ),
        )
        .limit(100);
      pairs = srcRows.map((source) => ({
        source,
        rulebook: books.find((b) => b.id === source.rulebookId)!,
      }));
    }
    const results = [];
    for (const { source, rulebook } of pairs) {
      results.push(await refreshSource(source, rulebook, { asOf: args.asOf }));
    }
    const changed = results.filter((r) => r.status === "changed");
    const stale = results.reduce((n, r) => n + r.staleFactIds.length, 0);
    const errors = results.filter((r) => r.status === "error").length;
    return {
      results,
      message: `${args.asOf ? `Loaded the Internet Archive copy from ${args.asOf}. ` : ""}Checked ${results.length} page(s): ${changed.length} changed, ${stale} fact(s) now stale${errors ? `, ${errors} failed to load` : ""}.`,
    };
  },
});

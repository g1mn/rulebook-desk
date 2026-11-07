import { defineAction } from "@agent-native/core/action";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireRulebook } from "../server/lib/rulebook/service.js";

export default defineAction({
  description:
    "Permanently delete a rulebook with its tracked pages, snapshots, facts and change history. Needs admin access (the owner has it). Ask the person to confirm first.",
  schema: z.object({ id: z.string().describe("Rulebook id") }),
  outputSchema: z.object({ id: z.string(), name: z.string(), message: z.string() }),
  needsApproval: (_args, ctx) => ctx?.caller !== "frontend",
  run: async ({ id }) => {
    const rulebook = await requireRulebook(id, "admin");
    await getDb().transaction(async (tx) => {
      const sourceRows = await tx
        .select({ id: schema.sources.id })
        .from(schema.sources)
        .where(eq(schema.sources.rulebookId, rulebook.id))
        .limit(50);
      await tx.delete(schema.changes).where(eq(schema.changes.rulebookId, rulebook.id));
      await tx.delete(schema.facts).where(eq(schema.facts.rulebookId, rulebook.id));
      if (sourceRows.length)
        await tx.delete(schema.snapshots).where(
          inArray(
            schema.snapshots.sourceId,
            sourceRows.map((s) => s.id),
          ),
        );
      await tx.delete(schema.sources).where(eq(schema.sources.rulebookId, rulebook.id));
      await tx.delete(schema.rulebookShares).where(eq(schema.rulebookShares.resourceId, rulebook.id));
      await tx.delete(schema.rulebooks).where(eq(schema.rulebooks.id, rulebook.id));
    });
    return { id: rulebook.id, name: rulebook.name, message: `Deleted "${rulebook.name}".` };
  },
});

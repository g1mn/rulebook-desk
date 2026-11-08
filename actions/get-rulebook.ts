import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import {
  changeOut,
  factOut,
  sourceOut,
  toFactOut,
} from "../server/lib/rulebook/schemas.js";
import { recentChanges, requireRulebook } from "../server/lib/rulebook/service.js";
import { splitParagraphs } from "../server/lib/rulebook/text.js";

export default defineAction({
  description:
    "Get one rulebook with its sources (no page text; archivedAt is set when a source shows an Internet Archive copy instead of today's page), every fact (deadlines and requirements with quote verification and review status), and the 10 most recent detected changes. Use read-source for page text.",
  schema: z.object({
    id: z.string().describe("Rulebook id from list-rulebooks"),
  }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    notes: z.string().nullable(),
    updatedAt: z.string(),
    sources: z.array(sourceOut),
    facts: z.array(factOut),
    changes: z.array(changeOut),
  }),
  http: { method: "GET" },
  readOnly: true,
  link: ({ args }) => ({
    url: buildDeepLink({
      view: "rulebook",
      to: `/desk/${encodeURIComponent(args.id)}`,
      params: { rulebookId: args.id },
    }),
    label: "Open rulebook",
  }),
  run: async ({ id }) => {
    const rulebook = await requireRulebook(id, "viewer");
    const db = getDb();
    const srcRows = await db
      .select()
      .from(schema.sources)
      .where(eq(schema.sources.rulebookId, id))
      .orderBy(asc(schema.sources.createdAt))
      .limit(20);
    const snapIds = srcRows
      .map((s) => s.currentSnapshotId)
      .filter((x): x is string => Boolean(x));
    const snaps = snapIds.length
      ? await db
          .select({
            id: schema.snapshots.id,
            text: schema.snapshots.text,
            archivedAt: schema.snapshots.archivedAt,
          })
          .from(schema.snapshots)
          .where(inArray(schema.snapshots.id, snapIds))
          .limit(20)
      : [];
    const factRows = await db
      .select()
      .from(schema.facts)
      .where(eq(schema.facts.rulebookId, id))
      .orderBy(asc(schema.facts.createdAt))
      .limit(500);
    const changeRows = await recentChanges(id, 10);
    const archiveSnapIds = changeRows
      .flatMap((c) => [c.fromSnapshotId, c.toSnapshotId])
      .filter((x): x is string => Boolean(x));
    const archiveSnaps = archiveSnapIds.length
      ? await db
          .select({
            id: schema.snapshots.id,
            archivedAt: schema.snapshots.archivedAt,
          })
          .from(schema.snapshots)
          .where(inArray(schema.snapshots.id, archiveSnapIds))
          .limit(40)
      : [];
    return {
      id: rulebook.id,
      name: rulebook.name,
      notes: rulebook.notes,
      updatedAt: rulebook.updatedAt,
      sources: srcRows.map((s) => ({
        id: s.id,
        url: s.url,
        title: s.title,
        lastCheckedAt: s.lastCheckedAt,
        lastChangedAt: s.lastChangedAt,
        lastStatus: s.lastStatus,
        lastError: s.lastError,
        paragraphs: splitParagraphs(
          snaps.find((x) => x.id === s.currentSnapshotId)?.text ?? "",
        ).length,
        archivedAt: snaps.find((x) => x.id === s.currentSnapshotId)?.archivedAt ?? null,
      })),
      facts: factRows.map(toFactOut),
      changes: changeRows.map((c) => ({
        id: c.id,
        sourceId: c.sourceId,
        kind: c.kind,
        detectedAt: c.detectedAt,
        archivedAt:
          archiveSnaps.find((s) => s.id === c.toSnapshotId)?.archivedAt ??
          null,
        fromArchivedAt:
          archiveSnaps.find((s) => s.id === c.fromSnapshotId)?.archivedAt ??
          null,
        added: JSON.parse(c.added) as string[],
        removed: JSON.parse(c.removed) as string[],
        affectedFactIds: JSON.parse(c.affectedFactIds) as string[],
      })),
    };
  },
});

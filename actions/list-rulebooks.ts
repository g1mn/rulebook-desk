import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { accessFilter } from "@agent-native/core/sharing";
import { desc, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { clockFor, resolveClockViewer } from "../server/lib/rulebook/clock.js";
import { clockOut } from "../server/lib/rulebook/schemas.js";

export default defineAction({
  description:
    "List the rulebooks (contests, grants, programs) the user tracks, with fact counts by status, the next upcoming deadline (UTC ISO, plus a clock with time left computed in code, to quote as is), and when sources were last checked.",
  schema: z.object({}),
  outputSchema: z.object({
    rulebooks: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        updatedAt: z.string(),
        sources: z.number(),
        lastCheckedAt: z.string().nullable(),
        sourceErrors: z.number(),
        counts: z.object({
          proposed: z.number(),
          approved: z.number(),
          rejected: z.number(),
          stale: z.number(),
          unverified: z.number(),
        }),
        nextDeadline: z
          .object({
            factId: z.string(),
            label: z.string(),
            dueAt: z.string(),
            dueTimeZone: z.string().nullable(),
            status: z.string(),
            clock: clockOut,
          })
          .nullable(),
        requirementsDone: z.number(),
        requirementsTotal: z.number(),
        lastChangeAt: z.string().nullable(),
        deadlines: z.array(
          z.object({ label: z.string(), dueAt: z.string(), status: z.string() }),
        ),
      }),
    ),
  }),
  http: { method: "GET" },
  readOnly: true,
  link: () => ({
    url: buildDeepLink({ view: "desk", to: "/desk" }),
    label: "Open Rulebook Desk",
  }),
  run: async (_args, ctx) => {
    const db = getDb();
    const viewer = await resolveClockViewer(ctx?.userEmail);
    const { rulebooks, rulebookShares, sources, facts, changes } = schema;
    const books = await db
      .select({
        id: rulebooks.id,
        name: rulebooks.name,
        updatedAt: rulebooks.updatedAt,
      })
      .from(rulebooks)
      .where(accessFilter(rulebooks, rulebookShares))
      .orderBy(desc(rulebooks.updatedAt))
      .limit(100);
    if (!books.length) return { rulebooks: [] };
    const ids = books.map((b) => b.id);
    const srcRows = await db
      .select({
        rulebookId: sources.rulebookId,
        lastCheckedAt: sources.lastCheckedAt,
        lastStatus: sources.lastStatus,
      })
      .from(sources)
      .where(inArray(sources.rulebookId, ids))
      .limit(1000);
    const factRows = await db
      .select({
        id: facts.id,
        rulebookId: facts.rulebookId,
        kind: facts.kind,
        label: facts.label,
        status: facts.status,
        quoteStatus: facts.quoteStatus,
        dueAt: facts.dueAt,
        dueTimeZone: facts.dueTimeZone,
        done: facts.done,
      })
      .from(facts)
      .where(inArray(facts.rulebookId, ids))
      .limit(5000);
    const changeRows = await db
      .select({ rulebookId: changes.rulebookId, detectedAt: changes.detectedAt, kind: changes.kind })
      .from(changes)
      .where(inArray(changes.rulebookId, ids))
      .orderBy(desc(changes.detectedAt))
      .limit(1000);
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    return {
      rulebooks: books.map((b) => {
        const s = srcRows.filter((r) => r.rulebookId === b.id);
        const f = factRows.filter((r) => r.rulebookId === b.id);
        const counts = { proposed: 0, approved: 0, rejected: 0, stale: 0, unverified: 0 };
        for (const row of f) {
          counts[row.status] += 1;
          if (row.quoteStatus !== "verified" && row.status !== "rejected")
            counts.unverified += 1;
        }
        const upcoming = f
          .filter(
            (r) =>
              r.dueAt && r.dueAt >= now && r.status !== "rejected",
          )
          .sort((x, y) => (x.dueAt! < y.dueAt! ? -1 : 1))[0];
        const reqs = f.filter(
          (r) =>
            (r.kind === "requirement" || r.kind === "submission") &&
            r.status === "approved",
        );
        const checked = s
          .map((r) => r.lastCheckedAt)
          .filter((x): x is string => Boolean(x))
          .sort();
        const lastLive = changeRows.find((c) => c.rulebookId === b.id);
        return {
          id: b.id,
          name: b.name,
          updatedAt: b.updatedAt,
          sources: s.length,
          lastCheckedAt: checked[checked.length - 1] ?? null,
          sourceErrors: s.filter((r) => r.lastStatus === "error").length,
          counts,
          nextDeadline: upcoming
            ? {
                factId: upcoming.id,
                label: upcoming.label,
                dueAt: upcoming.dueAt!,
                dueTimeZone: upcoming.dueTimeZone,
                status: upcoming.status,
                clock: clockFor(upcoming, viewer, nowMs)!,
              }
            : null,
          requirementsDone: reqs.filter((r) => r.done).length,
          requirementsTotal: reqs.length,
          lastChangeAt: lastLive?.detectedAt ?? null,
          deadlines: f
            .filter(
              (r) =>
                r.dueAt &&
                r.status !== "rejected" &&
                r.dueAt >= new Date(nowMs - 86_400_000).toISOString(),
            )
            .sort((x, y) => (x.dueAt! < y.dueAt! ? -1 : 1))
            .slice(0, 12)
            .map((r) => ({ label: r.label, dueAt: r.dueAt!, status: r.status })),
        };
      }),
    };
  },
});

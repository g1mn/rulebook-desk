import { defineAction, fail } from "@agent-native/core/action";
import type { WriteReceipt } from "@agent-native/core/action";
import { accessFilter } from "@agent-native/core/sharing";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import {
  factKind,
  factOut,
  receipt,
  toFactOut,
} from "../server/lib/rulebook/schemas.js";
import {
  checkQuote,
  editorFor,
  requireRulebook,
} from "../server/lib/rulebook/service.js";
import { normalizeForMatch } from "../server/lib/rulebook/text.js";
import {
  dateInQuote,
  resolveTimeZone,
  zonedLocalToUtc,
} from "../server/lib/rulebook/time.js";

const factIn = z.object({
  kind: factKind,
  label: z
    .string()
    .min(1)
    .max(140)
    .describe('Short label, e.g. "Final submission" or "Public Clips demo required"'),
  detail: z
    .string()
    .max(600)
    .optional()
    .describe("One or two sentences in your own words; omit when the label says it all"),
  quote: z
    .string()
    .max(800)
    .optional()
    .describe(
      "Exact sentence copied verbatim from read-source that proves this fact. Required for agents; it is checked against the fetched page and rejected if not found.",
    ),
  sourceId: z
    .string()
    .optional()
    .describe("Source the quote comes from; omit to search every page of the rulebook"),
  dueLocal: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .optional()
    .describe(
      'For deadlines: wall-clock time as written on the page, "YYYY-MM-DDTHH:mm" (e.g. "2026-11-09T23:59" for 11:59 PM)',
    ),
  timeZone: z
    .string()
    .optional()
    .describe(
      'Zone the page states for dueLocal: IANA name ("America/Los_Angeles") or abbreviation (PT, ET, UTC, KST, AoE). Required with dueLocal.',
    ),
});

export default defineAction({
  description:
    "Save deadlines and requirements for a rulebook in one batch. Each fact needs a verbatim quote from read-source; quotes not found on any fetched page are rejected (not saved) and listed in `rejected`, and a deadline is rejected unless its quote states that date (and hour, if the quote has a time). Deadline times are converted to UTC in code from dueLocal + timeZone, so never convert times yourself. New facts start as proposed for human review.",
  schema: z.object({
    rulebookId: z.string().describe("Rulebook id"),
    facts: z.array(factIn).min(1).max(40).describe("Facts to save"),
  }),
  outputSchema: z.object({
    saved: z.array(factOut),
    rejected: z.array(
      z.object({ index: z.number(), label: z.string(), reason: z.string() }),
    ),
    duplicates: z.array(z.object({ index: z.number(), existingId: z.string() })),
    message: z.string(),
    _receipt: receipt,
  }),
  searchHints: ["extract deadlines", "add requirement", "add fact"],
  run: async (args, ctx) => {
    const rulebook = await requireRulebook(args.rulebookId, "editor");
    const editor = editorFor(ctx?.caller);
    const db = getDb();
    const existing = await db
      .select({
        id: schema.facts.id,
        label: schema.facts.label,
        quote: schema.facts.quote,
      })
      .from(schema.facts)
      .where(eq(schema.facts.rulebookId, rulebook.id))
      .limit(500);
    const seen = new Map(
      existing.map((f) => [
        normalizeForMatch(f.label) + "|" + normalizeForMatch(f.quote ?? ""),
        f.id,
      ]),
    );
    const now = new Date().toISOString();
    const rows: (typeof schema.facts.$inferInsert)[] = [];
    const rejected: { index: number; label: string; reason: string }[] = [];
    const duplicates: { index: number; existingId: string }[] = [];

    for (const [index, f] of args.facts.entries()) {
      const key = normalizeForMatch(f.label) + "|" + normalizeForMatch(f.quote ?? "");
      const dup = seen.get(key);
      if (dup) {
        duplicates.push({ index, existingId: dup });
        continue;
      }
      if (!f.quote?.trim() && editor !== "person") {
        rejected.push({ index, label: f.label, reason: "Missing quote. Agents must cite the page verbatim." });
        continue;
      }
      let dueAt: string | null = null;
      let timeZone: string | null = null;
      if (f.dueLocal || f.timeZone) {
        if (!f.dueLocal || !f.timeZone) {
          rejected.push({ index, label: f.label, reason: "dueLocal and timeZone must be given together." });
          continue;
        }
        timeZone = resolveTimeZone(f.timeZone);
        if (!timeZone) {
          rejected.push({ index, label: f.label, reason: `Unknown time zone "${f.timeZone}". Use an IANA name.` });
          continue;
        }
        dueAt = zonedLocalToUtc(f.dueLocal, timeZone);
        if (f.quote?.trim()) {
          const dated = dateInQuote(f.dueLocal, f.quote);
          if (!dated.ok) {
            rejected.push({
              index,
              label: f.label,
              reason: `${dated.reason} Quote the sentence that states this date.`,
            });
            continue;
          }
        }
      }
      const check = await checkQuote(rulebook.id, f.quote, f.sourceId);
      if (check.quoteStatus === "unverified") {
        rejected.push({
          index,
          label: f.label,
          reason: "Quote not found verbatim on any fetched page. Copy the exact sentence from read-source.",
        });
        continue;
      }
      seen.set(key, "pending");
      rows.push({
        id: crypto.randomUUID(),
        rulebookId: rulebook.id,
        sourceId: check.sourceId,
        kind: f.kind,
        label: f.label.trim(),
        detail: f.detail?.trim() || null,
        dueLocal: f.dueLocal ?? null,
        dueTimeZone: timeZone,
        dueAt,
        quote: f.quote?.trim() || null,
        quoteStatus: check.quoteStatus,
        quoteParagraph: check.quoteParagraph,
        status: "proposed",
        staleReason: null,
        done: false,
        createdBy: editor,
        updatedBy: editor,
        ownerEmail: ctx?.userEmail ?? rulebook.ownerEmail,
        orgId: rulebook.orgId,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (!rows.length && !duplicates.length)
      fail(
        `Nothing saved. ${rejected.map((r) => `#${r.index} ${r.label}: ${r.reason}`).join(" ")}`,
        { errorCode: "no_valid_facts", details: { rejected } },
      );
    const saved = rows.length
      ? await db.insert(schema.facts).values(rows).returning()
      : [];
    if (saved.length)
      await db
        .update(schema.rulebooks)
        .set({ updatedAt: now })
        .where(
          and(
            eq(schema.rulebooks.id, rulebook.id),
            accessFilter(schema.rulebooks, schema.rulebookShares, undefined, "editor"),
          ),
        );
    const _receipt: WriteReceipt = {
      changed: saved.length > 0,
      verified: rejected.length === 0,
      subject: rulebook.id,
      summary: `Saved ${saved.length} fact(s) with verified quotes; rejected ${rejected.length}; ${duplicates.length} already existed.`,
      checks: rejected.slice(0, 8).map((r) => ({
        id: `fact-${r.index}`,
        ok: false,
        detail: r.reason.slice(0, 120),
      })),
    };
    return {
      saved: saved.map(toFactOut),
      rejected,
      duplicates,
      message: _receipt.summary,
      _receipt,
    };
  },
});

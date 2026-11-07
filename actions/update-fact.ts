import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { factKind, factOut, toFactOut } from "../server/lib/rulebook/schemas.js";
import {
  checkQuote,
  editorFor,
  requireRulebook,
} from "../server/lib/rulebook/service.js";
import {
  dateInQuote,
  resolveTimeZone,
  zonedLocalToUtc,
} from "../server/lib/rulebook/time.js";

export default defineAction({
  description:
    'Edit one fact (patch only the fields you pass) or change its review status. Rules: a fact can be "approved" only when its quote is verified on the current page (409 quote_unverified otherwise); agent approvals need the person to confirm in chat; when an agent edits an approved fact it goes back to "proposed" for review; agents cannot save an unverified quote.',
  schema: z.object({
    id: z.string().describe("Fact id"),
    label: z.string().min(1).max(140).optional().describe("New label"),
    detail: z.string().max(600).nullable().optional().describe("New detail; null clears it"),
    kind: factKind.optional(),
    quote: z
      .string()
      .max(800)
      .optional()
      .describe("Replacement verbatim quote; re-checked against the fetched pages"),
    dueLocal: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
      .nullable()
      .optional()
      .describe('Wall-clock "YYYY-MM-DDTHH:mm" in timeZone; null clears the date'),
    timeZone: z
      .string()
      .optional()
      .describe("IANA zone or abbreviation for dueLocal (PT, ET, UTC, KST, AoE)"),
    status: z
      .enum(["proposed", "approved", "rejected"])
      .optional()
      .describe('Review status: "proposed", "approved" or "rejected"'),
    done: z
      .boolean()
      .optional()
      .describe("Checklist tick for requirements/submission items"),
  }),
  outputSchema: factOut,
  needsApproval: (args, ctx) =>
    args.status === "approved" && ctx?.caller !== "frontend",
  run: async (args, ctx) => {
    const db = getDb();
    const [fact] = await db
      .select()
      .from(schema.facts)
      .where(eq(schema.facts.id, args.id))
      .limit(1);
    if (!fact) fail("Fact not found.", { errorCode: "not_found", statusCode: 404 });
    await requireRulebook(fact.rulebookId, "editor");
    const editor = editorFor(ctx?.caller);
    const patch: Partial<typeof schema.facts.$inferInsert> = {};
    let contentChanged = false;

    if (args.label !== undefined && args.label.trim() !== fact.label) {
      patch.label = args.label.trim();
      contentChanged = true;
    }
    if (args.detail !== undefined && (args.detail ?? null) !== fact.detail) {
      patch.detail = args.detail?.trim() || null;
      contentChanged = true;
    }
    if (args.kind !== undefined && args.kind !== fact.kind) {
      patch.kind = args.kind;
      contentChanged = true;
    }
    let quoteStatus = fact.quoteStatus;
    if (args.quote !== undefined && args.quote.trim() !== (fact.quote ?? "")) {
      if (!args.quote.trim() && editor !== "person")
        fail("Agents cannot remove a quote. Replace it with the exact sentence instead.", {
          errorCode: "quote_required",
          statusCode: 422,
        });
      const check = await checkQuote(fact.rulebookId, args.quote, fact.sourceId);
      if (check.quoteStatus === "unverified" && editor !== "person")
        fail("Quote not found verbatim on any fetched page.", {
          errorCode: "quote_not_found",
          statusCode: 422,
        });
      patch.quote = args.quote.trim() || null;
      patch.quoteStatus = check.quoteStatus;
      patch.quoteParagraph = check.quoteParagraph;
      patch.sourceId = check.sourceId;
      quoteStatus = check.quoteStatus;
      contentChanged = true;
    }
    if (args.dueLocal !== undefined || args.timeZone !== undefined) {
      if (args.dueLocal === null) {
        patch.dueLocal = null;
        patch.dueTimeZone = null;
        patch.dueAt = null;
      } else {
        const local = args.dueLocal ?? fact.dueLocal;
        const zoneInput = args.timeZone ?? fact.dueTimeZone;
        if (!local || !zoneInput)
          fail("Give both dueLocal and timeZone.", { errorCode: "invalid_time" });
        const zone = resolveTimeZone(zoneInput);
        if (!zone)
          fail(`Unknown time zone "${zoneInput}".`, { errorCode: "invalid_time" });
        if (local !== fact.dueLocal || zone !== fact.dueTimeZone) {
          patch.dueLocal = local;
          patch.dueTimeZone = zone;
          patch.dueAt = zonedLocalToUtc(local, zone);
          contentChanged = true;
        }
      }
      if (args.dueLocal === null && fact.dueLocal !== null) contentChanged = true;
    }
    if (args.done !== undefined) patch.done = args.done;

    // An agent may not pair a quote with a date the quote does not state.
    const finalLocal = patch.dueLocal !== undefined ? patch.dueLocal : fact.dueLocal;
    const finalQuote = patch.quote !== undefined ? patch.quote : fact.quote;
    if (
      editor !== "person" &&
      (patch.dueLocal !== undefined || patch.quote !== undefined) &&
      finalLocal &&
      finalQuote
    ) {
      const dated = dateInQuote(finalLocal, finalQuote);
      if (!dated.ok)
        fail(`${dated.reason} Quote the sentence that states this date.`, {
          errorCode: "date_not_in_quote",
          statusCode: 422,
        });
    }

    let status = fact.status;
    if (args.status !== undefined) status = args.status;
    else if (contentChanged && editor !== "person" && fact.status === "approved")
      status = "proposed";
    if (status === "approved" && quoteStatus !== "verified")
      fail(
        quoteStatus === "none"
          ? "Add a verbatim quote from the page before approving."
          : "The quote is not on the current page. Fix the quote, then approve.",
        { errorCode: "quote_unverified", statusCode: 409 },
      );
    if (status === "approved" && fact.status !== "approved") patch.staleReason = null;
    if (status !== fact.status) patch.status = status;
    if (quoteStatus !== "verified" && status === "approved") patch.status = "proposed";

    if (!Object.keys(patch).length) return toFactOut(fact);
    patch.updatedBy = editor;
    patch.updatedAt = new Date().toISOString();
    const [saved] = await db
      .update(schema.facts)
      .set(patch)
      .where(eq(schema.facts.id, fact.id))
      .returning();
    await db
      .update(schema.rulebooks)
      .set({ updatedAt: patch.updatedAt })
      .where(eq(schema.rulebooks.id, fact.rulebookId));
    if (!saved) fail("Fact not found.", { errorCode: "not_found", statusCode: 404 });
    return toFactOut(saved);
  },
});

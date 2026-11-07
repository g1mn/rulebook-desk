import { z } from "zod";

import { FACT_KINDS, FACT_STATUSES } from "../../db/schema.js";

export const factKind = z
  .enum(FACT_KINDS)
  .describe(
    'Fact kind: "deadline" (a dated cutoff), "submission" (what to hand in), "requirement" (a rule the entry must meet), "eligibility" (who may enter), "judging" (criteria/weights), "prize", or "other"',
  );

export const factOut = z.object({
  id: z.string(),
  rulebookId: z.string(),
  sourceId: z.string().nullable(),
  kind: z.enum(FACT_KINDS),
  label: z.string(),
  detail: z.string().nullable(),
  dueLocal: z.string().nullable(),
  dueTimeZone: z.string().nullable(),
  dueAt: z.string().nullable(),
  quote: z.string().nullable(),
  quoteStatus: z.enum(["verified", "unverified", "none"]),
  quoteParagraph: z.number().nullable(),
  status: z.enum(FACT_STATUSES),
  staleReason: z.string().nullable(),
  done: z.boolean(),
  createdBy: z.string(),
  updatedBy: z.string(),
  updatedAt: z.string(),
});
export type FactOut = z.infer<typeof factOut>;

export const sourceOut = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string().nullable(),
  lastCheckedAt: z.string().nullable(),
  lastChangedAt: z.string().nullable(),
  lastStatus: z.enum(["pending", "ok", "error"]),
  lastError: z.string().nullable(),
  paragraphs: z.number(),
});

export const changeOut = z.object({
  id: z.string(),
  sourceId: z.string(),
  kind: z.enum(["live", "archive"]),
  detectedAt: z.string(),
  archivedAt: z.string().nullable(),
  added: z.array(z.string()),
  removed: z.array(z.string()),
  affectedFactIds: z.array(z.string()),
});

export const refreshOut = z.object({
  sourceId: z.string(),
  url: z.string(),
  status: z.enum([
    "unchanged",
    "changed",
    "first-fetch",
    "error",
  ]),
  title: z.string().nullable(),
  paragraphs: z.number(),
  added: z.number(),
  removed: z.number(),
  staleFactIds: z.array(z.string()),
  changeId: z.string().nullable(),
  error: z.string().optional(),
});

export const receipt = z.any().optional();

/** Columns returned to callers for a fact row. */
export function toFactOut(row: {
  id: string;
  rulebookId: string;
  sourceId: string | null;
  kind: FactOut["kind"];
  label: string;
  detail: string | null;
  dueLocal: string | null;
  dueTimeZone: string | null;
  dueAt: string | null;
  quote: string | null;
  quoteStatus: FactOut["quoteStatus"];
  quoteParagraph: number | null;
  status: FactOut["status"];
  staleReason: string | null;
  done: boolean;
  createdBy: string;
  updatedBy: string;
  updatedAt: string;
}): FactOut {
  return {
    id: row.id,
    rulebookId: row.rulebookId,
    sourceId: row.sourceId,
    kind: row.kind,
    label: row.label,
    detail: row.detail,
    dueLocal: row.dueLocal,
    dueTimeZone: row.dueTimeZone,
    dueAt: row.dueAt,
    quote: row.quote,
    quoteStatus: row.quoteStatus,
    quoteParagraph: row.quoteParagraph,
    status: row.status,
    staleReason: row.staleReason,
    done: row.done,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
  };
}

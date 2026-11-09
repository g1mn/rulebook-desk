import { z } from "zod";

import { FACT_KINDS, FACT_STATUSES } from "../../db/schema.js";

export const factKind = z
  .enum(FACT_KINDS)
  .describe(
    'Fact kind: "deadline" (a dated cutoff), "submission" (what to hand in), "requirement" (a rule the entry must meet), "eligibility" (who may enter), "judging" (criteria/weights), "prize", or "other"',
  );

/** Deadline times computed in code (shared/deadline-clock.ts), the strings the screen shows. */
export const clockOut = z
  .object({
    dueAt: z.string(),
    utc: z.string(),
    yourTime: z.string(),
    pageTime: z.string().nullable(),
    timeLeft: z.string(),
    past: z.boolean(),
    minutesLeft: z.number().nullable(),
    dateOnly: z.boolean(),
    daysLeft: z.number().nullable(),
  })
  .describe(
    "Computed in code for the person's time zone and language, as the screen shows it. Quote timeLeft, yourTime, pageTime and utc exactly; never do date or time arithmetic yourself. dateOnly: the page gave a date and no time, so dueAt is that date (YYYY-MM-DD), timeLeft counts whole days, minutesLeft is null and no time of day may be stated for it.",
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
  dueAt: z
    .string()
    .nullable()
    .describe(
      "UTC instant for sorting. When dueLocal is a date with no time, this is the start of that day in the page's zone, not a time the page gave: quote clock instead.",
    ),
  quote: z.string().nullable(),
  quoteStatus: z.enum(["verified", "unverified", "none"]),
  quoteParagraph: z.number().nullable(),
  status: z.enum(FACT_STATUSES),
  staleReason: z.string().nullable(),
  done: z.boolean(),
  createdBy: z.string(),
  updatedBy: z.string(),
  updatedAt: z.string(),
  /** Set on dated facts: time left and the deadline in each zone. */
  clock: clockOut.nullable().optional(),
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
  /** Wayback timestamp when the current text is an Internet Archive copy, else null (live page). */
  archivedAt: z.string().nullable(),
});

export const changeOut = z.object({
  id: z.string(),
  sourceId: z.string(),
  kind: z.enum(["live", "archive"]),
  detectedAt: z.string(),
  archivedAt: z.string().nullable(),
  fromArchivedAt: z.string().nullable(),
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
    "compared",
    "error",
  ]),
  title: z.string().nullable(),
  paragraphs: z.number(),
  added: z.number(),
  removed: z.number(),
  staleFactIds: z.array(z.string()),
  changeId: z.string().nullable(),
  archivedAt: z.string().nullable().optional(),
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

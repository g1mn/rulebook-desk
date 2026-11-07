import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, text } from "drizzle-orm/pg-core";
import {
  createSharesTable,
  ownableColumns,
} from "@agent-native/core/db/schema";

/** A contest, grant or program whose rules the user tracks. */
export const rulebooks = pgTable("rulebooks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`now()`),
  ...ownableColumns(),
});
export const rulebookShares = createSharesTable("rulebook_shares");

/** A public page (rules, FAQ, submission form) that belongs to a rulebook. */
export const sources = pgTable("rulebook_sources", {
  id: text("id").primaryKey(),
  rulebookId: text("rulebook_id").notNull(),
  url: text("url").notNull(),
  title: text("title"),
  currentSnapshotId: text("current_snapshot_id"),
  lastCheckedAt: text("last_checked_at"),
  lastChangedAt: text("last_changed_at"),
  lastStatus: text("last_status", { enum: ["pending", "ok", "error"] })
    .notNull()
    .default("pending"),
  lastError: text("last_error"),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
});

/** Plain text of a source as fetched at one moment. */
export const snapshots = pgTable("rulebook_snapshots", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  fetchedAt: text("fetched_at").notNull(),
  archivedAt: text("archived_at"),
  contentHash: text("content_hash").notNull(),
  text: text("text").notNull(),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
});

export const FACT_KINDS = [
  "deadline",
  "submission",
  "requirement",
  "eligibility",
  "judging",
  "prize",
  "other",
] as const;
export const FACT_STATUSES = [
  "proposed",
  "approved",
  "rejected",
  "stale",
] as const;

/** One deadline or requirement, always tied to a verbatim quote. */
export const facts = pgTable("rulebook_facts", {
  id: text("id").primaryKey(),
  rulebookId: text("rulebook_id").notNull(),
  sourceId: text("source_id"),
  kind: text("kind", { enum: FACT_KINDS }).notNull(),
  label: text("label").notNull(),
  detail: text("detail"),
  dueLocal: text("due_local"),
  dueTimeZone: text("due_time_zone"),
  dueAt: text("due_at"),
  quote: text("quote"),
  quoteStatus: text("quote_status", {
    enum: ["verified", "unverified", "none"],
  })
    .notNull()
    .default("none"),
  quoteParagraph: integer("quote_paragraph"),
  status: text("status", { enum: FACT_STATUSES })
    .notNull()
    .default("proposed"),
  staleReason: text("stale_reason"),
  done: boolean("done").notNull().default(false),
  createdBy: text("created_by").notNull().default("agent"),
  updatedBy: text("updated_by").notNull().default("agent"),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`now()`),
});

/** A detected change between two snapshots of a source. */
export const changes = pgTable("rulebook_changes", {
  id: text("id").primaryKey(),
  rulebookId: text("rulebook_id").notNull(),
  sourceId: text("source_id").notNull(),
  detectedAt: text("detected_at").notNull(),
  /** live = a re-check found new text; archive = compared with a Wayback copy. */
  kind: text("kind", { enum: ["live", "archive"] })
    .notNull()
    .default("live"),
  fromSnapshotId: text("from_snapshot_id"),
  toSnapshotId: text("to_snapshot_id").notNull(),
  added: text("added").notNull().default("[]"),
  removed: text("removed").notNull().default("[]"),
  /** live: facts whose quote vanished (now stale). archive: facts whose quote is new since the archive. */
  affectedFactIds: text("affected_fact_ids").notNull().default("[]"),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
});

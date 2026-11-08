import { fail } from "@agent-native/core/action";
import { emit } from "@agent-native/core/event-bus";
import { accessFilter } from "@agent-native/core/sharing";
import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "../../db/index.js";
import { fetchPage } from "./fetch-page.js";
import {
  diffParagraphs,
  findQuote,
  splitParagraphs,
  withoutCounterNoise,
} from "./text.js";

export const SOURCE_CHANGED_EVENT = "rulebook.source.changed";

export type Caller = string | undefined;

/** "person" when a human used the UI, otherwise the surface name. */
export function editorFor(caller: Caller): string {
  if (caller === "frontend") return "person";
  if (caller === "automation") return "automation";
  return "agent";
}

export async function requireRulebook(
  id: string,
  role: "viewer" | "editor" | "admin" = "viewer",
) {
  const [row] = await getDb()
    .select()
    .from(schema.rulebooks)
    .where(
      and(
        eq(schema.rulebooks.id, id),
        accessFilter(schema.rulebooks, schema.rulebookShares, undefined, role),
      ),
    )
    .limit(1);
  if (!row) {
    if (role !== "viewer") {
      const [visible] = await getDb()
        .select({ id: schema.rulebooks.id })
        .from(schema.rulebooks)
        .where(
          and(
            eq(schema.rulebooks.id, id),
            accessFilter(schema.rulebooks, schema.rulebookShares, undefined, "viewer"),
          ),
        )
        .limit(1);
      if (visible)
        fail("You can view this rulebook but not change it.", {
          errorCode: "forbidden",
          statusCode: 403,
        });
    }
    fail("Rulebook not found.", { errorCode: "not_found", statusCode: 404 });
  }
  return row;
}

export async function requireSource(id: string, role: "viewer" | "editor") {
  const [source] = await getDb()
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.id, id))
    .limit(1);
  if (!source)
    fail("Source not found.", { errorCode: "not_found", statusCode: 404 });
  const rulebook = await requireRulebook(source.rulebookId, role);
  return { source, rulebook };
}

export async function currentText(
  snapshotId: string | null,
): Promise<string | null> {
  if (!snapshotId) return null;
  const [snap] = await getDb()
    .select({ text: schema.snapshots.text })
    .from(schema.snapshots)
    .where(eq(schema.snapshots.id, snapshotId))
    .limit(1);
  return snap?.text ?? null;
}

export interface SourceText {
  sourceId: string;
  url: string;
  text: string;
  /** When this text was on the page: the Wayback capture time, else our fetch time. */
  capturedAt: string;
}

/** Latest text for every fetched source of a rulebook. */
export async function rulebookTexts(rulebookId: string): Promise<SourceText[]> {
  const rows = await getDb()
    .select({
      id: schema.sources.id,
      url: schema.sources.url,
      text: schema.snapshots.text,
      fetchedAt: schema.snapshots.fetchedAt,
      archivedAt: schema.snapshots.archivedAt,
    })
    .from(schema.sources)
    .innerJoin(schema.snapshots, eq(schema.snapshots.id, schema.sources.currentSnapshotId))
    .where(eq(schema.sources.rulebookId, rulebookId))
    .limit(20);
  return rows.map((row) => ({
    sourceId: row.id,
    url: row.url,
    text: row.text,
    capturedAt: captureTime(row),
  }));
}

/** Capture time of the current text of one source, for year checks. */
export async function sourceCapturedAt(sourceId: string | null): Promise<string | null> {
  if (!sourceId) return null;
  const [row] = await getDb()
    .select({ fetchedAt: schema.snapshots.fetchedAt, archivedAt: schema.snapshots.archivedAt })
    .from(schema.sources)
    .innerJoin(schema.snapshots, eq(schema.snapshots.id, schema.sources.currentSnapshotId))
    .where(eq(schema.sources.id, sourceId))
    .limit(1);
  return row ? captureTime(row) : null;
}

export interface QuoteCheck {
  quoteStatus: "verified" | "unverified" | "none";
  sourceId: string | null;
  quoteParagraph: number | null;
  /** Capture time of the page text the quote was found in. */
  capturedAt?: string | null;
}

/** Look for the quote in the given source first, then any source of the rulebook. */
export async function checkQuote(
  rulebookId: string,
  quote: string | null | undefined,
  preferredSourceId?: string | null,
  preloaded?: SourceText[],
): Promise<QuoteCheck> {
  if (!quote || !quote.trim())
    return {
      quoteStatus: "none",
      sourceId: preferredSourceId ?? null,
      quoteParagraph: null,
    };
  const texts = [...(preloaded ?? (await rulebookTexts(rulebookId)))];
  texts.sort((a, b) =>
    a.sourceId === preferredSourceId ? -1 : b.sourceId === preferredSourceId ? 1 : 0,
  );
  for (const t of texts) {
    const match = findQuote(t.text, quote);
    if (match.found)
      return {
        quoteStatus: "verified",
        sourceId: t.sourceId,
        quoteParagraph: match.paragraph,
        capturedAt: t.capturedAt,
      };
  }
  return {
    quoteStatus: "unverified",
    sourceId: preferredSourceId ?? null,
    quoteParagraph: null,
  };
}

export interface RefreshResult {
  sourceId: string;
  url: string;
  status: "unchanged" | "changed" | "first-fetch" | "compared" | "error";
  title: string | null;
  paragraphs: number;
  added: number;
  removed: number;
  staleFactIds: string[];
  changeId: string | null;
  /** Wayback capture actually loaded, when asOf was used. */
  archivedAt?: string | null;
  error?: string;
}

/** Capture time of a snapshot as ISO: the Wayback timestamp, else when we fetched it. */
export function captureTime(snap: { archivedAt: string | null; fetchedAt: string }): string {
  const m = snap.archivedAt
    ? /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/.exec(snap.archivedAt)
    : null;
  if (!m) return snap.fetchedAt;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}.000Z`;
}

/**
 * Fetch a source (live, or an Internet Archive copy with asOf), store a
 * snapshot when the text changed, diff it against the previous snapshot,
 * re-check every quote from that source, and mark facts stale when their
 * quote disappeared. An archive copy older than the current snapshot is only
 * compared ("what changed since then"): the current text and fact statuses
 * stay as they are.
 */
export async function refreshSource(
  source: typeof schema.sources.$inferSelect,
  rulebook: typeof schema.rulebooks.$inferSelect,
  opts: { asOf?: string | undefined } = {},
): Promise<RefreshResult> {
  const db = getDb();
  const now = new Date().toISOString();
  const owner = { ownerEmail: rulebook.ownerEmail, orgId: rulebook.orgId };
  let page;
  try {
    page = await fetchPage(source.url, { archiveTimestamp: opts.asOf });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!opts.asOf)
      await db
        .update(schema.sources)
        .set({ lastCheckedAt: now, lastStatus: "error", lastError: message })
        .where(eq(schema.sources.id, source.id));
    return {
      sourceId: source.id,
      url: source.url,
      status: "error",
      title: source.title,
      paragraphs: 0,
      added: 0,
      removed: 0,
      staleFactIds: [],
      changeId: null,
      error: message,
    };
  }
  const archivedAt = page.archivedAt;

  const [previous] = source.currentSnapshotId
    ? await db
        .select()
        .from(schema.snapshots)
        .where(eq(schema.snapshots.id, source.currentSnapshotId))
        .limit(1)
    : [];
  const paragraphs = splitParagraphs(page.text).length;
  const title = page.title || source.title || null;
  const base = { sourceId: source.id, url: source.url, title, paragraphs, archivedAt };

  if (previous && previous.contentHash === page.contentHash) {
    if (!archivedAt)
      await db
        .update(schema.sources)
        .set({ lastCheckedAt: now, lastStatus: "ok", lastError: null, title })
        .where(eq(schema.sources.id, source.id));
    return { ...base, status: "unchanged", added: 0, removed: 0, staleFactIds: [], changeId: null };
  }

  // An archive copy older than what we already have: compare only.
  if (
    previous &&
    archivedAt &&
    captureTime({ archivedAt, fetchedAt: now }) < captureTime(previous)
  ) {
    const snapshotId = crypto.randomUUID();
    await db.insert(schema.snapshots).values({
      id: snapshotId,
      sourceId: source.id,
      fetchedAt: now,
      archivedAt,
      contentHash: page.contentHash,
      text: page.text,
      ...owner,
    });
    const diff = withoutCounterNoise(diffParagraphs(page.text, previous.text));
    const changeId = crypto.randomUUID();
    await db.insert(schema.changes).values({
      id: changeId,
      rulebookId: rulebook.id,
      sourceId: source.id,
      detectedAt: now,
      kind: "archive",
      fromSnapshotId: snapshotId,
      toSnapshotId: previous.id,
      added: JSON.stringify(diff.added.slice(0, 60)),
      removed: JSON.stringify(diff.removed.slice(0, 60)),
      affectedFactIds: "[]",
      ...owner,
    });
    return {
      ...base,
      status: "compared",
      added: diff.added.length,
      removed: diff.removed.length,
      staleFactIds: [],
      changeId,
    };
  }

  const snapshotId = crypto.randomUUID();
  await db.insert(schema.snapshots).values({
    id: snapshotId,
    sourceId: source.id,
    fetchedAt: now,
    archivedAt,
    contentHash: page.contentHash,
    text: page.text,
    ...owner,
  });
  await db
    .update(schema.sources)
    .set({
      currentSnapshotId: snapshotId,
      lastCheckedAt: now,
      lastStatus: "ok",
      lastError: null,
      title,
    })
    .where(eq(schema.sources.id, source.id));

  // Re-check every quote that cites this source.
  const factRows = await db
    .select()
    .from(schema.facts)
    .where(
      and(
        eq(schema.facts.rulebookId, rulebook.id),
        eq(schema.facts.sourceId, source.id),
      ),
    )
    .limit(500);
  const staleFactIds: string[] = [];
  for (const fact of factRows) {
    if (!fact.quote) continue;
    const match = findQuote(page.text, fact.quote);
    if (match.found) {
      if (fact.status === "stale") {
        // The sentence is back (a revert, or an outage that ended): needs review again.
        await db
          .update(schema.facts)
          .set({
            quoteStatus: "verified",
            quoteParagraph: match.paragraph,
            status: "proposed",
            staleReason: null,
            updatedAt: now,
            updatedBy: "automation",
          })
          .where(eq(schema.facts.id, fact.id));
      } else if (
        fact.quoteParagraph !== match.paragraph ||
        fact.quoteStatus !== "verified"
      ) {
        await db
          .update(schema.facts)
          .set({ quoteStatus: "verified", quoteParagraph: match.paragraph })
          .where(eq(schema.facts.id, fact.id));
      }
      continue;
    }
    if (previous && (fact.status === "approved" || fact.status === "proposed")) {
      staleFactIds.push(fact.id);
      await db
        .update(schema.facts)
        .set({
          quoteStatus: "unverified",
          quoteParagraph: null,
          status: "stale",
          staleReason: archivedAt
            ? `Quote is gone from the Internet Archive copy of ${hostOf(source.url)} dated ${formatWayback(archivedAt)}.`
            : `Quote no longer appears on ${hostOf(source.url)} (checked ${now.slice(0, 16).replace("T", " ")} UTC).`,
          updatedAt: now,
          updatedBy: "automation",
        })
        .where(eq(schema.facts.id, fact.id));
    } else if (fact.quoteStatus !== "unverified") {
      await db
        .update(schema.facts)
        .set({ quoteStatus: "unverified", quoteParagraph: null })
        .where(eq(schema.facts.id, fact.id));
    }
  }

  if (!previous) {
    return { ...base, status: "first-fetch", added: 0, removed: 0, staleFactIds, changeId: null };
  }

  const diff = withoutCounterNoise(diffParagraphs(previous.text, page.text));
  if (!diff.added.length && !diff.removed.length && !staleFactIds.length) {
    // Only counters moved (participant counts and the like): keep the new
    // snapshot, but this is not a rules change.
    return { ...base, status: "unchanged", added: 0, removed: 0, staleFactIds, changeId: null };
  }
  const changeId = crypto.randomUUID();
  await db.insert(schema.changes).values({
    id: changeId,
    rulebookId: rulebook.id,
    sourceId: source.id,
    detectedAt: now,
    kind: archivedAt ? "archive" : "live",
    fromSnapshotId: previous.id,
    toSnapshotId: snapshotId,
    added: JSON.stringify(diff.added.slice(0, 60)),
    removed: JSON.stringify(diff.removed.slice(0, 60)),
    affectedFactIds: JSON.stringify(staleFactIds),
    ...owner,
  });
  await db
    .update(schema.sources)
    .set({ lastChangedAt: now })
    .where(eq(schema.sources.id, source.id));
  await db
    .update(schema.rulebooks)
    .set({ updatedAt: now })
    .where(
      and(
        eq(schema.rulebooks.id, rulebook.id),
        accessFilter(schema.rulebooks, schema.rulebookShares, undefined, "editor"),
      ),
    );

  emit(
    SOURCE_CHANGED_EVENT,
    {
      rulebookId: rulebook.id,
      rulebookName: rulebook.name,
      sourceId: source.id,
      url: source.url,
      changeId,
      archivedAt,
      addedParagraphs: diff.added.length,
      removedParagraphs: diff.removed.length,
      staleFactIds,
    },
    // Automations belong to the rulebook owner, whoever added the page.
    { owner: rulebook.ownerEmail },
  );

  return {
    ...base,
    status: "changed",
    added: diff.added.length,
    removed: diff.removed.length,
    staleFactIds,
    changeId,
  };
}

export function formatWayback(ts: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(ts);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : ts;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export async function recentChanges(rulebookId: string, limit = 10) {
  return getDb()
    .select()
    .from(schema.changes)
    .where(eq(schema.changes.rulebookId, rulebookId))
    .orderBy(desc(schema.changes.detectedAt))
    .limit(limit);
}

export async function factsByIds(ids: string[]) {
  if (!ids.length) return [];
  return getDb()
    .select({ id: schema.facts.id, label: schema.facts.label })
    .from(schema.facts)
    .where(inArray(schema.facts.id, ids))
    .limit(200);
}

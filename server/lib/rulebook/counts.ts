import { FACT_KINDS, FACT_STATUSES } from "../../db/schema.js";

type Kind = (typeof FACT_KINDS)[number];
type Status = (typeof FACT_STATUSES)[number];

/** Fact counts computed in code, the same numbers as the review table's group headers (every fact of a kind, any status). */
export type FactCounts = {
  total: number;
  byKind: Partial<Record<Kind, number>>;
  byStatus: Partial<Record<Status, number>>;
};

export function factCounts(facts: { kind: string; status?: string | null }[]): FactCounts {
  const byKind: Partial<Record<Kind, number>> = {};
  const byStatus: Partial<Record<Status, number>> = {};
  for (const k of FACT_KINDS) {
    const n = facts.filter((f) => f.kind === k).length;
    if (n) byKind[k] = n;
  }
  for (const s of FACT_STATUSES) {
    const n = facts.filter((f) => f.status === s).length;
    if (n) byStatus[s] = n;
  }
  return { total: facts.length, byKind, byStatus };
}

/** "43 facts: deadline 6, submission 3, … (proposed 42, approved 1)" in the kinds' screen order. */
export function countsText(c: FactCounts): string {
  const kinds = Object.entries(c.byKind).map(([k, n]) => `${k} ${n}`);
  const statuses = Object.entries(c.byStatus).map(([s, n]) => `${s} ${n}`);
  return `${c.total} fact${c.total === 1 ? "" : "s"}${kinds.length ? `: ${kinds.join(", ")}` : ""}${statuses.length ? ` (${statuses.join(", ")})` : ""}`;
}

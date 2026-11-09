import { runWithRequestContext } from "@agent-native/core/server";
import { beforeAll, describe, expect, it } from "vitest";

import getRulebook from "../../../actions/get-rulebook";
import saveFacts from "../../../actions/save-facts";
import { getDb, schema } from "../../db/index";
import migrate from "../../plugins/db";
import { AGENT_SYSTEM_PROMPT } from "../agent-prompt";
import { countsText, factCounts } from "./counts";

// v2.3 demo, extract scene: the agent's own summary said "Deadlines (7)" and
// "Judging (8)" while the table's group headers read DEADLINES 6 and JUDGING 7.
// Counts now come from code, like the deadline clock, and the agent quotes them.
const OWNER = "counts-test@local.test";
const RULEBOOK = "rb-counts-test";
const PAGE = [
  "Schedule",
  "October 27, 2026 : Hackathon begins; building can start immediately.",
  "Monday, November 9, 2026 at 11:59 PM PT : Final submission deadline.",
  "Judging",
  "Usefulness and execution: 40%.",
  "Creativity and design: 20%.",
  "Prizes",
  "First place: $5,000.",
].join("\n\n");

const asAgent = { caller: "agent", userEmail: OWNER } as never;
const asOwner = async <T>(fn: () => T | Promise<T>): Promise<T> =>
  await runWithRequestContext({ userEmail: OWNER, timezone: "Asia/Seoul" }, async () => await fn());

describe("fact counts are computed in code", () => {
  beforeAll(async () => {
    await (migrate as unknown as () => Promise<void>)();
    const db = getDb();
    const at = "2026-11-08T00:00:00.000Z";
    await db.insert(schema.rulebooks).values({ id: RULEBOOK, name: "Agent-Native Hackathon", ownerEmail: OWNER, createdAt: at, updatedAt: at });
    await db.insert(schema.sources).values({
      id: "src-counts-test",
      rulebookId: RULEBOOK,
      url: "https://www.builder.io/hackathon/rules",
      lastStatus: "ok",
      currentSnapshotId: "snap-counts-test",
      ownerEmail: OWNER,
      createdAt: at,
    });
    await db.insert(schema.snapshots).values({
      id: "snap-counts-test",
      sourceId: "src-counts-test",
      fetchedAt: at,
      contentHash: "h",
      text: PAGE,
      ownerEmail: OWNER,
    });
  });

  it("counts per kind and status, in the table's kind order", () => {
    const c = factCounts([
      { kind: "judging", status: "proposed" },
      { kind: "deadline", status: "approved" },
      { kind: "deadline", status: "rejected" },
      { kind: "prize", status: "proposed" },
    ]);
    expect(c).toEqual({
      total: 4,
      byKind: { deadline: 2, judging: 1, prize: 1 },
      byStatus: { proposed: 2, approved: 1, rejected: 1 },
    });
    expect(countsText(c)).toBe("4 facts: deadline 2, judging 1, prize 1 (proposed 2, approved 1, rejected 1)");
    expect(countsText(factCounts([]))).toBe("0 facts");
  });

  it("save-facts returns this call's counts and the rulebook's, and its message quotes both", async () => {
    const first = (await asOwner(() =>
      saveFacts.run(
        {
          rulebookId: RULEBOOK,
          facts: [
            { kind: "deadline", label: "Hackathon begins", quote: "October 27, 2026 : Hackathon begins; building can start immediately.", dueLocal: "2026-10-27", timeZone: "PT" },
            { kind: "deadline", label: "Final submission deadline", quote: "Monday, November 9, 2026 at 11:59 PM PT : Final submission deadline.", dueLocal: "2026-11-09T23:59", timeZone: "PT" },
            { kind: "judging", label: "Usefulness and execution 40%", quote: "Usefulness and execution: 40%." },
            // not on the page: rejected, and not counted
            { kind: "judging", label: "Video quality 10%", quote: "Video quality: 10%." },
          ],
        },
        asAgent,
      ),
    )) as { counts: { saved: unknown; rulebook: unknown }; rejected: unknown[]; message: string };
    expect(first.rejected).toHaveLength(1);
    expect(first.counts.saved).toEqual({ total: 3, byKind: { deadline: 2, judging: 1 }, byStatus: { proposed: 3 } });
    expect(first.counts.rulebook).toEqual(first.counts.saved);
    expect(first.message).toContain(
      "Counts, computed in code (quote as is, never count facts yourself): this call saved 3 facts: deadline 2, judging 1 (proposed 3); the rulebook now holds 3 facts: deadline 2, judging 1 (proposed 3).",
    );

    // a second batch (one call is capped at 40 facts): the rulebook totals add up in code
    const second = (await asOwner(() =>
      saveFacts.run(
        {
          rulebookId: RULEBOOK,
          facts: [
            { kind: "judging", label: "Creativity and design 20%", quote: "Creativity and design: 20%." },
            { kind: "prize", label: "First place $5,000", quote: "First place: $5,000." },
          ],
        },
        asAgent,
      ),
    )) as { counts: { saved: unknown; rulebook: unknown }; message: string };
    expect(second.counts.saved).toEqual({ total: 2, byKind: { judging: 1, prize: 1 }, byStatus: { proposed: 2 } });
    expect(second.counts.rulebook).toEqual({ total: 5, byKind: { deadline: 2, judging: 2, prize: 1 }, byStatus: { proposed: 5 } });
    expect(second.message).toContain("the rulebook now holds 5 facts: deadline 2, judging 2, prize 1 (proposed 5).");
  });

  it("get-rulebook carries the same counts as the table's group headers", async () => {
    const rb = (await asOwner(() => getRulebook.run({ id: RULEBOOK }, asAgent))) as {
      facts: { kind: string }[];
      counts: { total: number; byKind: Record<string, number> };
    };
    expect(rb.counts.total).toBe(rb.facts.length);
    for (const [kind, n] of Object.entries(rb.counts.byKind))
      expect(rb.facts.filter((f) => f.kind === kind)).toHaveLength(n);
    expect(rb.counts.byKind).toEqual({ deadline: 2, judging: 2, prize: 1 });
  });

  it("the system prompt forbids the agent's own counting and names the code values", () => {
    expect(AGENT_SYSTEM_PROMPT).toContain("Never count facts yourself");
    expect(AGENT_SYSTEM_PROMPT).toContain("save-facts returns counts");
    expect(AGENT_SYSTEM_PROMPT).toContain("get-rulebook returns counts");
  });
});

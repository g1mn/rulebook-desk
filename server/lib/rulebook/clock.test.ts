import { deleteAppState, writeAppState } from "@agent-native/core/application-state";
import { runWithRequestContext } from "@agent-native/core/server";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import deadlineClockAction from "../../../actions/deadline-clock";
import getRulebook from "../../../actions/get-rulebook";
import listRulebooks from "../../../actions/list-rulebooks";
import saveFacts from "../../../actions/save-facts";
import { countdown, deadlineClock } from "../../../shared/deadline-clock";
import { getDb, schema } from "../../db/index";
import migrate from "../../plugins/db";
import { AGENT_SYSTEM_PROMPT } from "../agent-prompt";
import { CLOCK_RULE, deadlineClockBlock, deadlineClockContext, deskTimeT } from "./clock";

// The v2.1 demo's extract scene was recorded at 14:37 KST. The agent wrote
// "today, in about 18 hours from now (05:37 UTC)" for a deadline 26h 22m away.
const NOW = Date.parse("2026-11-09T05:37:00Z");
// "November 9, 2026, at 11:59 PM PT (November 10, 2026, at 07:59 UTC)"
const DUE = "2026-11-10T07:59:00.000Z";
const OWNER = "clock-test@local.test";
const RULEBOOK = "rb-clock-test";
const SENTENCE = "Monday, November 9, 2026 at 11:59 PM PT : Final submission deadline.";

const seoul = (lang = "en-US") => ({
  req: { headers: new Headers({ "x-user-timezone": "Asia/Seoul", "accept-language": lang }) },
});
const asOwner = async <T>(fn: () => T | Promise<T>): Promise<T> =>
  await runWithRequestContext({ userEmail: OWNER, timezone: "Asia/Seoul" }, async () => await fn());

describe("deadline clock: time left is computed in code", () => {
  it("gives the real time left for the Agent-Native deadline", () => {
    const c = deadlineClock(DUE, {
      t: deskTimeT("en-US"),
      locale: "en-US",
      viewerTimeZone: "Asia/Seoul",
      pageTimeZone: "America/Los_Angeles",
      now: NOW,
    });
    expect(c).toEqual({
      dueAt: DUE,
      utc: "2026-11-10 07:59 UTC",
      yourTime: "Tue, Nov 10, 2026, 4:59 PM Seoul time",
      pageTime: "Mon, Nov 9, 2026, 11:59 PM PST",
      timeLeft: "1d 2h left",
      past: false,
      minutesLeft: 26 * 60 + 22,
    });
  });

  it("counts down and then reports how long ago a deadline closed", () => {
    const t = deskTimeT("en-US");
    expect(countdown(DUE, t, Date.parse("2026-11-10T05:00:00Z"))).toMatchObject({
      text: "2h 59m left",
      minutes: 179,
    });
    expect(countdown(DUE, t, Date.parse("2026-11-10T08:04:00Z"))).toMatchObject({
      text: "closed 5m ago",
      past: true,
      minutes: -5,
    });
  });

  it("writes the server strings in the person's language", () => {
    expect(countdown(DUE, deskTimeT("ko-KR"), NOW).text).toBe("1일 2시간 남음");
    expect(countdown(DUE, deskTimeT("ja-JP"), NOW).text).toBe("残り1日2時間");
    expect(countdown(DUE, deskTimeT("fr-FR"), NOW).text).toBe("encore 1 j 2 h");
  });

  it("the context block lists each deadline's code-computed strings and the no-math rule", () => {
    const viewer = { locale: "en-US" as const, timeZone: "Asia/Seoul" };
    const clock = deadlineClock(DUE, {
      t: deskTimeT("en-US"),
      locale: "en-US",
      viewerTimeZone: "Asia/Seoul",
      pageTimeZone: "America/Los_Angeles",
      now: NOW,
    });
    const block = deadlineClockBlock({
      viewer,
      now: NOW,
      rulebook: { name: "Agent-Native Hackathon" },
      deadlines: [
        {
          factId: "f1",
          rulebookId: "rb",
          rulebookName: "Agent-Native Hackathon",
          label: "Final submission deadline",
          kind: "deadline",
          status: "approved",
          clock,
        },
      ],
    });
    expect(block).toBe(
      [
        "<deadline-clock>",
        "Computed in code. Now: 2026-11-09 05:37 UTC (the person's time: Mon, Nov 9, 2026, 2:37 PM Seoul time, zone Asia/Seoul).",
        'Deadlines in the open rulebook "Agent-Native Hackathon", soonest first:',
        "- Final submission deadline: 1d 2h left | your time Tue, Nov 10, 2026, 4:59 PM Seoul time | page says Mon, Nov 9, 2026, 11:59 PM PST | 2026-11-10 07:59 UTC (factId f1, approved)",
        CLOCK_RULE,
        "</deadline-clock>",
      ].join("\n"),
    );
  });

  it("the system prompt forbids the agent's own time math and names the code values", () => {
    expect(AGENT_SYSTEM_PROMPT).toContain("Never work out how much time is left");
    expect(AGENT_SYSTEM_PROMPT).toContain("deadline-clock");
    expect(AGENT_SYSTEM_PROMPT).toContain("<deadline-clock>");
    for (const field of ["timeLeft", "yourTime", "pageTime", "utc"])
      expect(AGENT_SYSTEM_PROMPT).toContain(field);
  });
});

describe("agent context and action outputs carry the code-computed clock", () => {
  beforeAll(async () => {
    await (migrate as unknown as () => Promise<void>)();
    const db = getDb();
    const at = "2026-11-08T00:00:00.000Z";
    await db.insert(schema.rulebooks).values({
      id: RULEBOOK,
      name: "Agent-Native Hackathon",
      ownerEmail: OWNER,
      createdAt: at,
      updatedAt: at,
    });
    await db.insert(schema.sources).values({
      id: "src-clock-test",
      rulebookId: RULEBOOK,
      url: "https://www.builder.io/hackathon/rules",
      lastStatus: "ok",
      currentSnapshotId: "snap-clock-test",
      ownerEmail: OWNER,
      createdAt: at,
    });
    await db.insert(schema.snapshots).values({
      id: "snap-clock-test",
      sourceId: "src-clock-test",
      fetchedAt: at,
      contentHash: "h",
      text: `Schedule\n\n${SENTENCE}\n\nJudging ends Monday, December 14, 2026 at 5:00 PM PT.`,
      ownerEmail: OWNER,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("save-facts returns each deadline's time left, and its message quotes it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const out = (await asOwner(() =>
      saveFacts.run(
        {
          rulebookId: RULEBOOK,
          facts: [
            {
              kind: "deadline",
              label: "Final submission deadline",
              quote: SENTENCE,
              dueLocal: "2026-11-09T23:59",
              timeZone: "PT",
            },
            {
              kind: "deadline",
              label: "Rejected later",
              quote: "Judging ends Monday, December 14, 2026 at 5:00 PM PT.",
              dueLocal: "2026-12-14T17:00",
              timeZone: "PT",
            },
          ],
        },
        { caller: "agent", userEmail: OWNER } as never,
      ),
    )) as {
      saved: { id: string; label: string; clock: { timeLeft: string; utc: string; pageTime: string } }[];
      message: string;
    };
    expect(out.saved[0]!.clock).toMatchObject({
      timeLeft: "1d 2h left",
      utc: "2026-11-10 07:59 UTC",
      yourTime: "Tue, Nov 10, 2026, 4:59 PM Seoul time",
      pageTime: "Mon, Nov 9, 2026, 11:59 PM PST",
      minutesLeft: 1582,
    });
    expect(out.message).toContain(
      "Deadlines, computed in code (quote as is, do no time math): Final submission deadline: 1d 2h left (2026-11-10 07:59 UTC)",
    );
    await getDb()
      .update(schema.facts)
      .set({ status: "rejected" })
      .where(eq(schema.facts.id, out.saved[1]!.id));
  });

  it("the agent's context gets the clock block with code-computed values", async () => {
    const text = await asOwner(() => deadlineClockContext(seoul(), OWNER, NOW));
    expect(text).toContain("Now: 2026-11-09 05:37 UTC (the person's time: Mon, Nov 9, 2026, 2:37 PM Seoul time, zone Asia/Seoul)");
    expect(text).toContain(
      "- Final submission deadline [Agent-Native Hackathon]: 1d 2h left | your time Tue, Nov 10, 2026, 4:59 PM Seoul time | page says Mon, Nov 9, 2026, 11:59 PM PST | 2026-11-10 07:59 UTC",
    );
    expect(text).not.toContain("Rejected later");
    expect(text).toContain(CLOCK_RULE);

    const ko = await asOwner(() => deadlineClockContext(seoul("ko-KR"), OWNER, NOW));
    expect(ko).toContain("1일 2시간 남음");
  });

  it("a chat request has no time zone header: the person's zone comes from the screen's navigation state", async () => {
    // v2.2 demo recording: the Ask answer said "your time: Tue, Nov 10, 2026, 7:59 AM UTC" for a person in Seoul
    const chat = { req: { headers: new Headers({ "accept-language": "en-US" }) } };
    const asChat = async <T>(fn: () => T | Promise<T>): Promise<T> =>
      await runWithRequestContext({ userEmail: OWNER }, async () => await fn());
    expect(await asChat(() => deadlineClockContext(chat, OWNER, NOW))).toContain("zone UTC)");
    await asChat(() =>
      writeAppState("navigation", { view: "rulebook", rulebookId: RULEBOOK, timeZone: "Asia/Seoul" }),
    );
    try {
      const text = await asChat(() => deadlineClockContext(chat, OWNER, NOW));
      expect(text).toContain("(the person's time: Mon, Nov 9, 2026, 2:37 PM Seoul time, zone Asia/Seoul)");
      expect(text).toContain("1d 2h left | your time Tue, Nov 10, 2026, 4:59 PM Seoul time");
    } finally {
      await asChat(() => deleteAppState("navigation"));
    }
  });

  it("get-rulebook, list-rulebooks and deadline-clock return the same clock", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const ctx = { caller: "agent", userEmail: OWNER } as never;
    const book = (await asOwner(() => getRulebook.run({ id: RULEBOOK }, ctx))) as {
      facts: { label: string; clock: { timeLeft: string } | null }[];
    };
    expect(book.facts.find((f) => f.label === "Final submission deadline")!.clock!.timeLeft).toBe(
      "1d 2h left",
    );
    const list = (await asOwner(() => listRulebooks.run({}, ctx))) as {
      rulebooks: { id: string; nextDeadline: { clock: { timeLeft: string } } | null }[];
    };
    expect(list.rulebooks.find((r) => r.id === RULEBOOK)!.nextDeadline!.clock.timeLeft).toBe(
      "1d 2h left",
    );
    const clock = (await asOwner(() =>
      deadlineClockAction.run({ rulebookId: RULEBOOK, locale: "ko-KR" }, ctx),
    )) as {
      now: { utc: string; timeZone: string };
      deadlines: { label: string; clock: { timeLeft: string; utc: string } }[];
    };
    expect(clock.now).toMatchObject({ utc: "2026-11-09 05:37 UTC", timeZone: "Asia/Seoul" });
    expect(clock.deadlines.map((d) => [d.label, d.clock.timeLeft, d.clock.utc])).toEqual([
      ["Final submission deadline", "1일 2시간 남음", "2026-11-10 07:59 UTC"],
    ]);
  });
});

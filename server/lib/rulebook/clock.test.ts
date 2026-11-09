import { deleteAppState, writeAppState } from "@agent-native/core/application-state";
import { runWithRequestContext } from "@agent-native/core/server";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import deadlineClockAction from "../../../actions/deadline-clock";
import getRulebook from "../../../actions/get-rulebook";
import listRulebooks from "../../../actions/list-rulebooks";
import saveFacts from "../../../actions/save-facts";
import viewScreen from "../../../actions/view-screen";
import { countdown, dateCountdown, deadlineClock, isAhead } from "../../../shared/deadline-clock";
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
      dateOnly: false,
      daysLeft: null,
    });
    // dueLocal with a time changes nothing.
    expect(
      deadlineClock(DUE, {
        t: deskTimeT("en-US"),
        locale: "en-US",
        viewerTimeZone: "Asia/Seoul",
        pageTimeZone: "America/Los_Angeles",
        dueLocal: "2026-11-09T23:59",
        now: NOW,
      }),
    ).toEqual(c);
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

// v2.2 demo, 17:10 KST: "page says Tue, Oct 27, 2026, 12:00 AM PDT" for a
// quote that gives no time ("October 27, 2026 : Hackathon begins").
const V22 = Date.parse("2026-11-09T08:10:00Z");
const NO_TIME = /\d{1,2}:\d{2}|\b(AM|PM)\b|UTC\b/;

describe("date-only deadlines: the page gave no time, so none is shown", () => {
  const pt = "America/Los_Angeles";
  const clock = (dueLocal: string, dueAt: string, now = V22, locale = "en-US" as const) =>
    deadlineClock(dueAt, {
      t: deskTimeT(locale),
      locale,
      viewerTimeZone: "Asia/Seoul",
      pageTimeZone: pt,
      dueLocal,
      now,
    });

  it("gives the page's date and whole days, no midnight", () => {
    // dueAt is the start of the day in PT (stored for sorting only).
    expect(clock("2026-10-27", "2026-10-27T07:00:00.000Z")).toEqual({
      dueAt: "2026-10-27",
      utc: "2026-10-27, no time given",
      yourTime: "Tue, Oct 27, 2026 (no time given)",
      pageTime: "Tue, Oct 27, 2026 (no time given)",
      timeLeft: "closed 13d ago",
      past: true,
      minutesLeft: null,
      dateOnly: true,
      daysLeft: -13,
    });
    const target = clock("2026-11-13", "2026-11-13T08:00:00.000Z");
    expect(target).toMatchObject({
      dueAt: "2026-11-13",
      pageTime: "Fri, Nov 13, 2026 (no time given)",
      timeLeft: "4d left",
      past: false,
      daysLeft: 4,
      minutesLeft: null,
    });
    for (const value of [target.utc, target.yourTime, target.pageTime, target.timeLeft])
      expect(value).not.toMatch(NO_TIME);
  });

  it("counts days in the page's zone: the day turns at the page's midnight", () => {
    const t = deskTimeT("en-US");
    // 23:59 PST on Nov 8, then 00:00 PST on Nov 9.
    expect(dateCountdown("2026-11-13", pt, t, Date.parse("2026-11-09T07:59:00Z")).text).toBe("5d left");
    expect(dateCountdown("2026-11-13", pt, t, Date.parse("2026-11-09T08:00:00Z")).text).toBe("4d left");
    const onTheDay = dateCountdown("2026-11-13", pt, t, Date.parse("2026-11-13T20:00:00Z"));
    expect(onTheDay).toMatchObject({ text: "today", past: false, urgent: true, days: 0 });
    expect(dateCountdown("2026-11-13", pt, t, Date.parse("2026-11-14T08:00:00Z")).text).toBe(
      "closed 1d ago",
    );
    // Still "ahead" for its whole day; a timed deadline is ahead until its minute.
    const fact = { dueAt: "2026-11-13T08:00:00.000Z", dueLocal: "2026-11-13", dueTimeZone: pt };
    expect(isAhead(fact, Date.parse("2026-11-13T20:00:00Z"))).toBe(true);
    expect(isAhead(fact, Date.parse("2026-11-14T08:00:00Z"))).toBe(false);
    expect(isAhead({ ...fact, dueLocal: "2026-11-13T00:00" }, Date.parse("2026-11-13T20:00:00Z"))).toBe(
      false,
    );
  });

  it("the context block marks a date-only deadline and gives no time for it", () => {
    const viewer = { locale: "en-US" as const, timeZone: "Asia/Seoul" };
    const block = deadlineClockBlock({
      viewer,
      now: V22,
      rulebook: { name: "Agent-Native Hackathon" },
      deadlines: [
        {
          factId: "f2",
          rulebookId: "rb",
          rulebookName: "Agent-Native Hackathon",
          label: "Target winner announcement",
          kind: "deadline",
          status: "proposed",
          clock: clock("2026-11-13", "2026-11-13T08:00:00.000Z"),
        },
      ],
    });
    const line = block.split("\n").find((l) => l.startsWith("- Target"));
    expect(line).toBe(
      "- Target winner announcement: 4d left | date only, page says Fri, Nov 13, 2026 (no time given) (factId f2, proposed)",
    );
    expect(line).not.toMatch(NO_TIME);
    expect(CLOCK_RULE).toContain('A deadline marked "date only" has no time on the page');
    expect(AGENT_SYSTEM_PROMPT).toContain("send the date only");
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

// The Builder.io schedule gives two dates with no time. The v2.2 demo showed
// them as "page says Tue, Oct 27, 2026, 12:00 AM PDT" and "3d 23h left".
describe("date-only deadlines in action outputs and the agent's context", () => {
  const RB = "rb-clock-dates";
  const BEGINS = "October 27, 2026 : Hackathon begins. Build with Agent-Native.";
  const WINNERS = "November 13, 2026 : Target winner announcement.";
  const ctx = { caller: "agent", userEmail: OWNER } as never;
  let startId = "";
  let targetId = "";

  beforeAll(async () => {
    const db = getDb();
    const at = "2026-11-08T00:00:00.000Z";
    await db.insert(schema.rulebooks).values({
      id: RB,
      name: "Date-only schedule",
      ownerEmail: OWNER,
      createdAt: at,
      updatedAt: at,
    });
    await db.insert(schema.sources).values({
      id: "src-clock-dates",
      rulebookId: RB,
      url: "https://www.builder.io/hackathon",
      lastStatus: "ok",
      currentSnapshotId: "snap-clock-dates",
      ownerEmail: OWNER,
      createdAt: at,
    });
    await db.insert(schema.snapshots).values({
      id: "snap-clock-dates",
      sourceId: "src-clock-dates",
      fetchedAt: at,
      contentHash: "h2",
      text: `Key dates\n\n${BEGINS}\n\n${WINNERS}`,
      ownerEmail: OWNER,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("save-facts gives a date-only clock and says so in its message", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(V22);
    const out = (await asOwner(() =>
      saveFacts.run(
        {
          rulebookId: RB,
          facts: [
            { kind: "deadline", label: "Hackathon start", quote: BEGINS, dueLocal: "2026-10-27", timeZone: "PT" },
            {
              kind: "deadline",
              label: "Target winner announcement",
              quote: WINNERS,
              dueLocal: "2026-11-13",
              timeZone: "PT",
            },
          ],
        },
        ctx,
      ),
    )) as {
      saved: { id: string; label: string; dueAt: string; clock: Record<string, unknown> }[];
      rejected: unknown[];
      message: string;
    };
    expect(out.rejected).toEqual([]);
    const [start, target] = out.saved;
    startId = start!.id;
    targetId = target!.id;
    // Stored for sorting and the timeline: the start of the day in PT.
    expect(start!.dueAt).toBe("2026-10-27T07:00:00.000Z");
    expect(target!.clock).toEqual({
      dueAt: "2026-11-13",
      utc: "2026-11-13, no time given",
      yourTime: "Fri, Nov 13, 2026 (no time given)",
      pageTime: "Fri, Nov 13, 2026 (no time given)",
      timeLeft: "4d left",
      past: false,
      minutesLeft: null,
      dateOnly: true,
      daysLeft: 4,
    });
    expect(start!.clock).toMatchObject({ timeLeft: "closed 13d ago", dateOnly: true, daysLeft: -13 });
    expect(out.message).toContain(
      "Target winner announcement: 4d left (date only, 2026-11-13, no time given); Hackathon start: closed 13d ago (date only, 2026-10-27, no time given)",
    );
    for (const text of [out.message, JSON.stringify(out.saved.map((f) => f.clock))])
      expect(text).not.toMatch(NO_TIME);
  });

  it("the context block, deadline-clock, get-rulebook and list-rulebooks mark it dateOnly", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(V22);
    const text = await asOwner(() => deadlineClockContext(seoul(), OWNER, V22));
    const line = text.split("\n").find((l) => l.startsWith("- Target winner announcement"));
    expect(line).toBe(
      `- Target winner announcement [Date-only schedule]: 4d left | date only, page says Fri, Nov 13, 2026 (no time given) (factId ${targetId}, proposed)`,
    );
    // Timed deadlines keep their times next to it.
    expect(text).toContain("your time Tue, Nov 10, 2026, 4:59 PM Seoul time");
    const ko = await asOwner(() => deadlineClockContext(seoul("ko-KR"), OWNER, V22));
    expect(ko).toContain(
      "- Target winner announcement [Date-only schedule]: 4일 남음 | date only, page says 2026년 11월 13일 (금), 시각 미기재",
    );

    const clock = (await asOwner(() =>
      deadlineClockAction.run({ factId: startId, locale: "ja-JP" }, ctx),
    )) as { deadlines: { clock: Record<string, unknown> }[] };
    expect(clock.deadlines.map((d) => d.clock)).toEqual([
      {
        dueAt: "2026-10-27",
        utc: "2026-10-27, no time given",
        yourTime: "2026年10月27日(火)（時刻の記載なし）",
        pageTime: "2026年10月27日(火)（時刻の記載なし）",
        timeLeft: "13日前に締切",
        past: true,
        minutesLeft: null,
        dateOnly: true,
        daysLeft: -13,
      },
    ]);

    const book = (await asOwner(() => getRulebook.run({ id: RB }, ctx))) as {
      facts: { label: string; clock: { dateOnly: boolean; pageTime: string } | null }[];
    };
    expect(book.facts.map((f) => [f.label, f.clock!.dateOnly, f.clock!.pageTime])).toEqual(
      expect.arrayContaining([
        ["Hackathon start", true, "Tue, Oct 27, 2026 (no time given)"],
        ["Target winner announcement", true, "Fri, Nov 13, 2026 (no time given)"],
      ]),
    );
    const list = (await asOwner(() => listRulebooks.run({}, ctx))) as {
      rulebooks: {
        id: string;
        nextDeadline: { label: string; dueLocal: string | null; clock: { timeLeft: string; dateOnly: boolean } } | null;
      }[];
    };
    expect(list.rulebooks.find((r) => r.id === RB)!.nextDeadline).toMatchObject({
      label: "Target winner announcement",
      dueLocal: "2026-11-13",
      clock: { timeLeft: "4d left", dateOnly: true },
    });
    // A timed deadline's clock is unchanged.
    expect(list.rulebooks.find((r) => r.id === RULEBOOK)!.nextDeadline!.clock).toMatchObject({
      dateOnly: false,
    });
  });

  it("a date-only deadline is still next on its own day in the page's zone", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 20:00 UTC on Nov 13 is midday in PT: the stored start of day has passed, the date has not.
    const onTheDay = Date.parse("2026-11-13T20:00:00Z");
    vi.setSystemTime(onTheDay);
    const list = (await asOwner(() => listRulebooks.run({}, ctx))) as {
      rulebooks: { id: string; nextDeadline: { label: string; clock: { timeLeft: string } } | null }[];
    };
    expect(list.rulebooks.find((r) => r.id === RB)!.nextDeadline).toMatchObject({
      label: "Target winner announcement",
      clock: { timeLeft: "today" },
    });
    const text = await asOwner(() => deadlineClockContext(seoul(), OWNER, onTheDay));
    expect(text).toContain("- Target winner announcement [Date-only schedule]: today | date only");
  });

  it("view-screen gives the agent the date, not a start-of-day instant", async () => {
    await asOwner(() =>
      writeAppState("navigation", { view: "rulebook", rulebookId: RB, factId: targetId }),
    );
    try {
      const screen = (await asOwner(() => viewScreen.run({}, ctx))) as {
        rulebook: { facts: Record<string, unknown>[] };
        selectedFact: Record<string, unknown>;
      };
      const row = screen.rulebook.facts.find((f) => f.id === targetId)!;
      expect(row).toMatchObject({ dueDate: "2026-11-13", dateOnly: true });
      expect(row).not.toHaveProperty("dueAt");
      expect(screen.selectedFact).toMatchObject({ dueLocal: "2026-11-13", dateOnly: true });
      expect(screen.selectedFact).not.toHaveProperty("dueAt");
    } finally {
      await asOwner(() => deleteAppState("navigation"));
    }
  });
});

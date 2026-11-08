import { describe, expect, it } from "vitest";

import {
  diffParagraphs,
  findQuote,
  htmlToText,
  normalizeForMatch,
  withoutCounterNoise,
} from "./text.js";
import { dateInQuote, resolveTimeZone, yearForUndatedDay, zonedLocalToUtc } from "./time.js";

describe("zonedLocalToUtc", () => {
  it("matches the Agent-Native rules' own UTC statement", () => {
    // Rules page: "November 9, 2026, at 11:59 PM PT (November 10, 2026, at 07:59 UTC)"
    expect(zonedLocalToUtc("2026-11-09T23:59", "America/Los_Angeles")).toBe(
      "2026-11-10T07:59:00.000Z",
    );
  });
  it("handles daylight time and abbreviations", () => {
    expect(zonedLocalToUtc("2026-07-01T12:00", resolveTimeZone("PT")!)).toBe(
      "2026-07-01T19:00:00.000Z",
    );
    expect(zonedLocalToUtc("2026-11-10T16:59", resolveTimeZone("KST")!)).toBe(
      "2026-11-10T07:59:00.000Z",
    );
    expect(zonedLocalToUtc("2026-03-01T23:59", resolveTimeZone("AoE")!)).toBe(
      "2026-03-02T11:59:00.000Z",
    );
  });
  it("rejects unknown zones", () => {
    expect(resolveTimeZone("Mars/Olympus")).toBeNull();
  });
});

describe("findQuote", () => {
  const page =
    "Schedule\n\nMonday, November 9, 2026 at 11:59 PM PT : Final submission deadline.\n\nRecord a public Clips demonstration showing the actual application in use. The recording must be viewable without a login or access request.";
  it("finds verbatim quotes with typographic differences", () => {
    expect(findQuote(page, "The recording must be viewable without a login or access request.")).toEqual({ found: true, paragraph: 2 });
    expect(findQuote(page, "monday,  november 9, 2026 at 11:59 pm pt")).toEqual({ found: true, paragraph: 1 });
  });
  it("rejects invented or paraphrased quotes", () => {
    expect(findQuote(page, "Entries must include a 10-page PDF whitepaper.").found).toBe(false);
    expect(findQuote(page, "The video must be public.").found).toBe(false);
  });
  it("treats curly quotes and dashes like straight ones", () => {
    expect(normalizeForMatch("“Judging Period” – Jan 26")).toBe(normalizeForMatch('"Judging Period" - Jan 26'));
  });
});

describe("diff", () => {
  it("reports the real Kiroween 2025 judging change and ignores counters", () => {
    const before = "Participants (2421)\n\nJudging Period: Monday, December 15, 2025 (1:00 pm Pacific Time) – Monday, January 12, 2026 (1:00 pm Pacific Time).";
    const after = "Participants (5027)\n\nJudging Period: Monday, December 15, 2025 (1:00 pm Pacific Time) – Monday, January 26, 2026 (1:00 pm Pacific Time).";
    const d = withoutCounterNoise(diffParagraphs(before, after));
    expect(d.removed).toHaveLength(1);
    expect(d.added[0]).toContain("January 26, 2026");
  });
  it("counter-only churn is not a change", () => {
    const d = withoutCounterNoise(diffParagraphs("Participants (547)", "Participants (2421)"));
    expect(d).toEqual({ added: [], removed: [] });
  });
});

describe("htmlToText tables", () => {
  it("keeps a table row together so prize quotes carry their label", () => {
    const { text } = htmlToText("<body><table><tr><th>Prize</th><th>Amount</th></tr><tr><td>Grand Prize</td><td>$30,000 USD</td></tr></table></body>");
    expect(text.split("\n\n")).toEqual(["Prize | Amount", "Grand Prize | $30,000 USD"]);
  });
});

describe("htmlToText", () => {
  it("keeps main content and drops scripts, nav and footer", () => {
    const html = `<html><head><title>Rules &amp; FAQ</title><script>var x=1</script></head><body><nav><a>Log in</a></nav><main><h1>Official Rules</h1><p>Deadline:&nbsp;Dec 4, 2026 @ 2:00pm PST</p><ul><li>One</li><li>Two</li></ul></main><footer>© 2026</footer></body></html>`;
    const { title, text } = htmlToText(html);
    expect(title).toBe("Rules & FAQ");
    expect(text.split("\n\n")).toEqual(["Official Rules", "Deadline: Dec 4, 2026 @ 2:00pm PST", "One", "Two"]);
  });
});

describe("dateInQuote", () => {
  it("accepts quotes that state the date and time", () => {
    expect(dateInQuote("2026-11-09T23:59", "Monday, November 9, 2026 at 11:59 PM PT : Final submission deadline.").ok).toBe(true);
    expect(dateInQuote("2026-12-04T14:00", "Submission Period: October 30, 2026 (9:00 am Pacific Time) – December 4, 2026 (2:00 pm Pacific Time)").ok).toBe(true);
    expect(dateInQuote("2026-12-04T14:00", "Deadline: Dec 4, 2026 @ 2:00pm PST").ok).toBe(true);
    expect(dateInQuote("2026-12-01", "Credits must be redeemed by December 1, 2026.").ok).toBe(true);
  });
  it("rejects a misread date or hour", () => {
    expect(dateInQuote("2026-11-19T23:59", "Monday, November 9, 2026 at 11:59 PM PT").ok).toBe(false);
    expect(dateInQuote("2026-11-09T11:59", "Monday, November 9, 2026 at 11:59 PM PT").ok).toBe(false);
    expect(dateInQuote("2026-11-09T23:59", "The recording must be viewable without a login.").ok).toBe(false);
    // No time in the sentence: an invented midnight is rejected, the date alone is fine.
    expect(dateInQuote("2026-12-11T00:00", "Winners announced on or around December 11, 2026.").ok).toBe(false);
    expect(dateInQuote("2026-12-11", "Winners announced on or around December 11, 2026.").ok).toBe(true);
  });
  it("rejects a year the quote contradicts", () => {
    // Kiroween 2025 page (Wayback 2025-11-18) read as if it were this year's contest.
    expect(dateInQuote("2026-12-05", "Submissions close December 5, 2025.").ok).toBe(false);
    expect(dateInQuote("2025-12-05", "Submissions close December 5, 2025.").ok).toBe(true);
    expect(dateInQuote("2026-01-12", "Judging Period: December 8, 2025 – January 12, 2026").ok).toBe(true);
    expect(dateInQuote("2025-01-12", "Judging Period: December 8, 2025 – January 12, 2026").ok).toBe(false);
    expect(dateInQuote("2026-11-10", "2026년 11월 10일(화) 17시 마감").ok).toBe(true);
    expect(dateInQuote("2025-11-10", "2026년 11월 10일(화) 17시 마감").ok).toBe(false);
    expect(dateInQuote("2025-12-05", "Deadline 2026-12-05").ok).toBe(false);
  });
  it("lets the first day of a range borrow the year that ends it", () => {
    const quote = "Judging runs December 16 – January 29, 2027.";
    expect(dateInQuote("2026-12-16", quote).ok).toBe(true);
    expect(dateInQuote("2027-01-29", quote).ok).toBe(true);
    expect(dateInQuote("2024-12-16", quote).ok).toBe(false);
  });
  it("without a year, uses the year the page meant when it was captured", () => {
    const archived = { capturedAt: "2025-11-18T00:00:00.000Z" };
    expect(dateInQuote("2025-12-05", "Submissions close December 5.", archived).ok).toBe(true);
    expect(dateInQuote("2026-12-05", "Submissions close December 5.", archived).ok).toBe(false);
    expect(dateInQuote("2026-01-12", "Judging ends January 12.", archived).ok).toBe(true);
    expect(dateInQuote("2025-01-12", "Judging ends January 12.", archived).ok).toBe(false);
    // A page captured in January that names an October deadline looks ahead.
    expect(dateInQuote("2026-10-15", "Applications are due October 15.", { capturedAt: "2026-01-20T00:00:00.000Z" }).ok).toBe(true);
    // A prize amount is not a year.
    expect(dateInQuote("2025-12-05", "Win $2000. Submissions close December 5.", archived).ok).toBe(true);
    // Without a capture time there is nothing to compare against.
    expect(dateInQuote("2026-12-05", "Submissions close December 5.").ok).toBe(true);
  });
  it("yearForUndatedDay picks the one year in the look-ahead window", () => {
    expect(yearForUndatedDay(12, 5, "2025-11-18T00:00:00.000Z")).toBe(2025);
    expect(yearForUndatedDay(1, 12, "2025-11-18T00:00:00.000Z")).toBe(2026);
    expect(yearForUndatedDay(9, 1, "2025-11-18T00:00:00.000Z")).toBe(2025);
    expect(yearForUndatedDay(8, 1, "2025-11-18T00:00:00.000Z")).toBe(2026);
  });
});

describe("noise filter keeps date changes", () => {
  it("a short deadline line that changes is a rule change", () => {
    const d = withoutCounterNoise(diffParagraphs("Deadline: Dec 4, 2026", "Deadline: Dec 18, 2026"));
    expect(d.added).toEqual(["Deadline: Dec 18, 2026"]);
  });
});

describe("noise filter keeps rule edits", () => {
  it("prize, team size and table-row dates are changes; counters are not", () => {
    expect(withoutCounterNoise(diffParagraphs("Grand Prize | $30,000 USD", "Grand Prize | $10,000 USD")).added).toHaveLength(1);
    expect(withoutCounterNoise(diffParagraphs("Teams of up to 4 people.", "Teams of up to 2 people.")).added).toHaveLength(1);
    expect(withoutCounterNoise(diffParagraphs("Final Submission | November 9, 2026 11:59 PM PT", "Final Submission | November 16, 2026 11:59 PM PT")).added).toHaveLength(1);
    expect(withoutCounterNoise(diffParagraphs("1,203 registered", "1,388 registered"))).toEqual({ added: [], removed: [] });
  });
  it("rejects ambiguous bare zone abbreviations", () => {
    expect(resolveTimeZone("AST")).toBeNull();
    expect(resolveTimeZone("CST")).toBe("America/Chicago");
    expect(resolveTimeZone("Asia/Riyadh")).toBe("Asia/Riyadh");
  });
  it("strips unclosed script and comment without hanging", () => {
    const big = "<body><p>Rule one.</p><!-- open " + "<script>".repeat(2000) + "x".repeat(200000);
    const t0 = Date.now();
    const { text } = htmlToText(big);
    expect(Date.now() - t0).toBeLessThan(500);
    expect(text).toBe("Rule one.");
  });
});

import { describe, expect, it } from "vitest";

import {
  diffParagraphs,
  findQuote,
  htmlToText,
  normalizeForMatch,
  withoutCounterNoise,
} from "./text.js";
import { resolveTimeZone, zonedLocalToUtc } from "./time.js";

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

import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { currentText, requireSource } from "../server/lib/rulebook/service.js";
import { normalizeForMatch, splitParagraphs } from "../server/lib/rulebook/text.js";

export default defineAction({
  description:
    "Read the latest fetched text of a tracked page as numbered paragraphs. Use `find` to return only paragraphs containing any of the given words (case-insensitive), or page through with offset/limit. Copy quotes from here verbatim before calling save-facts.",
  schema: z.object({
    sourceId: z.string().describe("Source id from get-rulebook or create-rulebook"),
    find: z
      .string()
      .optional()
      .describe(
        'Optional comma-separated words; returns only paragraphs containing any of them, e.g. "deadline, PT, UTC, submit"',
      ),
    offset: z.coerce
      .number()
      .int()
      .min(0)
      .default(0)
      .describe("First paragraph index to return; defaults to 0"),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(500)
      .default(120)
      .describe("Maximum paragraphs to return (1-500); defaults to 120"),
  }),
  outputSchema: z.object({
    sourceId: z.string(),
    url: z.string(),
    title: z.string().nullable(),
    fetchedAt: z.string().nullable(),
    totalParagraphs: z.number(),
    paragraphs: z.array(z.object({ i: z.number(), text: z.string() })),
    nextOffset: z.number().nullable(),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async (args) => {
    const { source } = await requireSource(args.sourceId, "viewer");
    const text = await currentText(source.currentSnapshotId);
    if (text == null)
      fail("This page has not been fetched yet. Run check-sources first.", {
        errorCode: "not_fetched",
        statusCode: 409,
      });
    const all = splitParagraphs(text).map((p, i) => ({ i, text: p }));
    const words = (args.find ?? "")
      .split(",")
      .map((w) => normalizeForMatch(w))
      .filter(Boolean);
    const filtered = words.length
      ? all.filter((p) => {
          const n = normalizeForMatch(p.text);
          return words.some((w) => n.includes(w));
        })
      : all;
    const page = filtered.slice(args.offset, args.offset + args.limit);
    const next = args.offset + args.limit;
    return {
      sourceId: source.id,
      url: source.url,
      title: source.title,
      fetchedAt: source.lastCheckedAt,
      totalParagraphs: all.length,
      paragraphs: page,
      nextOffset: next < filtered.length ? next : null,
    };
  },
});

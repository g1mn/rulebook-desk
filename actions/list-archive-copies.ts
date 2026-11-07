import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { requireSource } from "../server/lib/rulebook/service.js";

const CDX = "https://web.archive.org/cdx/search/cdx";

export default defineAction({
  description:
    "List Internet Archive (Wayback Machine) copies of a tracked page whose content differs from the previous copy, newest last. Pass a copy's timestamp as asOf to check-sources to replay how the rules changed.",
  schema: z.object({
    sourceId: z.string().describe("Source id from get-rulebook"),
  }),
  outputSchema: z.object({
    sourceId: z.string(),
    url: z.string(),
    copies: z.array(z.object({ timestamp: z.string(), date: z.string() })),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ sourceId }) => {
    const { source } = await requireSource(sourceId, "viewer");
    const target = source.url.replace(/^https?:\/\//, "");
    const query = `${CDX}?url=${encodeURIComponent(target)}&output=json&fl=timestamp,digest&filter=statuscode:200&collapse=digest&limit=200`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let rows: string[][] = [];
    try {
      const res = await fetch(query, {
        signal: controller.signal,
        headers: { "user-agent": "Mozilla/5.0 (compatible; RulebookDesk/0.1)", accept: "*/*" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      rows = text.trim() ? (JSON.parse(text) as string[][]) : [];
    } catch (error) {
      fail(
        `The Internet Archive did not answer (${error instanceof Error ? error.message : "error"}).`,
        { errorCode: "archive_unavailable", statusCode: 502 },
      );
    } finally {
      clearTimeout(timer);
    }
    const copies = rows
      .slice(1)
      .filter((r) => /^\d{14}$/.test(r[0] ?? ""))
      .slice(-40)
      .map((r) => {
        const ts = r[0]!;
        return {
          timestamp: ts,
          date: `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`,
        };
      });
    return { sourceId: source.id, url: source.url, copies };
  },
});

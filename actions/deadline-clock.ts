import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { APP_LOCALES } from "../shared/locales.js";
import {
  nowClock,
  resolveClockViewer,
  upcomingDeadlines,
} from "../server/lib/rulebook/clock.js";
import { clockOut } from "../server/lib/rulebook/schemas.js";

export default defineAction({
  description:
    "The current time and, for each deadline, the time left and the deadline in the person's zone, the page's zone and UTC, all computed in code (the same strings the screen shows). Call this whenever you would say how long until a deadline, whether it is today or tomorrow, or what time it is somewhere, and quote the strings as returned. Never do date or time arithmetic yourself. With no ids it covers every tracked rulebook (deadlines still ahead plus those closed in the last day, soonest first).",
  schema: z.object({
    rulebookId: z.string().optional().describe("Limit to one rulebook"),
    factId: z.string().optional().describe("One deadline fact, even if it closed long ago"),
    timeZone: z
      .string()
      .optional()
      .describe(
        "The person's IANA time zone; omit to use their browser's (currentTimezone in <current-time>)",
      ),
    locale: z
      .enum(APP_LOCALES)
      .optional()
      .describe("Language of the strings; omit to use the person's screen language"),
  }),
  outputSchema: z.object({
    now: z.object({ utc: z.string(), yourTime: z.string(), timeZone: z.string() }),
    deadlines: z.array(
      z.object({
        factId: z.string(),
        rulebookId: z.string(),
        rulebookName: z.string(),
        label: z.string(),
        kind: z.string(),
        status: z.string(),
        clock: clockOut,
      }),
    ),
  }),
  http: { method: "GET" },
  readOnly: true,
  searchHints: ["time left", "how long until", "countdown", "days left", "what time"],
  link: ({ args }) => ({
    url: buildDeepLink(
      args.rulebookId
        ? {
            view: "rulebook",
            to: `/desk/${encodeURIComponent(args.rulebookId)}`,
            params: { rulebookId: args.rulebookId },
          }
        : { view: "desk", to: "/desk" },
    ),
    label: args.rulebookId ? "Open rulebook" : "Open Rulebook Desk",
  }),
  run: async (args, ctx) => {
    const viewer = await resolveClockViewer(ctx?.userEmail, {
      locale: args.locale,
      timeZone: args.timeZone,
    });
    const now = Date.now();
    const deadlines = await upcomingDeadlines(viewer, {
      rulebookId: args.rulebookId,
      factId: args.factId,
      now,
      limit: 30,
    });
    return { now: nowClock(viewer, now), deadlines };
  },
});

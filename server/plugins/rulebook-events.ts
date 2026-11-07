import { registerEvent } from "@agent-native/core/event-bus";
import { defineNitroPlugin } from "@agent-native/core/server";
import { z } from "zod";

import { SOURCE_CHANGED_EVENT } from "../lib/rulebook/service.js";

registerEvent({
  name: SOURCE_CHANGED_EVENT,
  description:
    "A tracked rules page changed since its last snapshot (live check, or a newer Internet Archive copy when archivedAt is set). Payload lists the change id and the approved or proposed facts whose verbatim quote disappeared (now stale).",
  payloadSchema: z.object({
    rulebookId: z.string(),
    rulebookName: z.string(),
    sourceId: z.string(),
    url: z.string(),
    changeId: z.string(),
    archivedAt: z.string().nullable(),
    addedParagraphs: z.number(),
    removedParagraphs: z.number(),
    staleFactIds: z.array(z.string()),
  }),
  example: {
    rulebookId: "rb_123",
    rulebookName: "Agent-Native Hackathon",
    sourceId: "src_123",
    url: "https://www.builder.io/hackathon/rules",
    changeId: "chg_123",
    archivedAt: null,
    addedParagraphs: 2,
    removedParagraphs: 1,
    staleFactIds: ["fact_123"],
  },
});

export default defineNitroPlugin(() => {});

import { defineAction } from "@agent-native/core/action";
import {
  readAppState,
  readAppStateForCurrentTab,
} from "@agent-native/core/application-state";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { isDateOnly } from "../shared/deadline-clock.js";
import { requireRulebook } from "../server/lib/rulebook/service.js";

export default defineAction({
  description:
    "Read what the person is looking at: navigation, the open rulebook (name, fact counts, stale facts) and the selected fact with its quote. Basic navigation is already in <current-screen>; call this for a fresh read before acting on 'this fact' or 'this rulebook'.",
  schema: z.object({}),
  http: false,
  readOnly: true,
  run: async () => {
    const navigation = (await readAppState("navigation")) as
      | { view?: string; rulebookId?: string; factId?: string }
      | null;
    const selection = await readAppStateForCurrentTab("selection").catch(() => null);
    const screen: Record<string, unknown> = {};
    if (navigation) screen.navigation = navigation;
    if (selection) screen.selection = selection;

    const rulebookId = navigation?.rulebookId;
    if (rulebookId) {
      const db = getDb();
      const rulebook = await requireRulebook(rulebookId, "viewer").catch(() => null);
      if (rulebook) {
        const facts = await db
          .select({
            id: schema.facts.id,
            kind: schema.facts.kind,
            label: schema.facts.label,
            status: schema.facts.status,
            quoteStatus: schema.facts.quoteStatus,
            dueAt: schema.facts.dueAt,
            dueLocal: schema.facts.dueLocal,
            quote: schema.facts.quote,
            staleReason: schema.facts.staleReason,
            done: schema.facts.done,
          })
          .from(schema.facts)
          .where(eq(schema.facts.rulebookId, rulebookId))
          .limit(300);
        const count = (status: string) => facts.filter((f) => f.status === status).length;
        const selectedId =
          navigation?.factId ??
          ((selection as { kind?: string; id?: string } | null)?.kind === "fact"
            ? (selection as { id: string }).id
            : undefined);
        screen.rulebook = {
          id: rulebook.id,
          name: rulebook.name,
          counts: {
            proposed: count("proposed"),
            approved: count("approved"),
            stale: count("stale"),
            rejected: count("rejected"),
          },
          staleFacts: facts
            .filter((f) => f.status === "stale")
            .map((f) => ({ id: f.id, label: f.label, staleReason: f.staleReason })),
          facts: facts.map((f) => ({
            id: f.id,
            kind: f.kind,
            label: f.label,
            status: f.status,
            // A date with no time on the page: give the date, not the start-of-day instant.
            ...(isDateOnly(f.dueLocal)
              ? { dueDate: f.dueLocal.trim(), dateOnly: true }
              : { dueAt: f.dueAt }),
            done: f.done,
          })),
        };
        const selected = facts.find((f) => f.id === selectedId);
        if (selected) {
          const { dueAt, ...rest } = selected;
          screen.selectedFact = isDateOnly(selected.dueLocal)
            ? { ...rest, dateOnly: true }
            : { ...rest, dueAt };
        }
      }
    }

    if (Object.keys(screen).length === 0) {
      return "No application state found. Is the app running?";
    }
    return screen;
  },
});

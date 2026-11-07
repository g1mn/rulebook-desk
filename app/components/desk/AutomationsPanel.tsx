import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { IconBolt, IconClockHour9, IconPlayerPlay } from "@tabler/icons-react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { relativeTime, userTimeZone } from "@/lib/rulebook";

/**
 * The two automations Rulebook Desk ships with. They are created through the
 * framework's own manage-automation action, so they live in Settings ›
 * Automations like any other and the agent can edit them too.
 */
export const DESK_AUTOMATIONS = {
  daily: {
    name: "daily-rules-check",
    triggerType: "schedule" as const,
    schedule: "0 9 * * *",
    body: "Run check-sources with no arguments to re-fetch every tracked rules page. If any page changed, list each rulebook with the paragraphs that changed and the facts that went stale. If nothing changed, reply with one line: all pages unchanged.",
  },
  repair: {
    name: "repair-stale-facts",
    triggerType: "event" as const,
    event: "rulebook.source.changed",
    condition: "staleFactIds is not empty",
    body: "A tracked rules page changed (payload has rulebookId, sourceId, changeId, staleFactIds). Call get-rulebook for the rulebook, then read-source for the changed page with find set to words from each stale fact's label. For each stale fact, if the page now states a different value, save the corrected fact with save-facts using a verbatim quote, then reject the stale one with update-fact. Never approve anything; leave new facts proposed for the person.",
  },
};

type Automation = {
  resourceId: string;
  name: string;
  enabled: boolean;
  lastRun: string | null;
  lastStatus: string | null;
  scheduleDescription?: string | null;
};

export function AutomationsPanel() {
  const { data, isPending } = useActionQuery("list-automations", {});
  const list = (Array.isArray(data) ? data : []) as Automation[];
  const daily = list.find((a) => a.name === DESK_AUTOMATIONS.daily.name);
  const repair = list.find((a) => a.name === DESK_AUTOMATIONS.repair.name);

  const manage = useActionMutation("manage-automation", {
    onError: (err) => toast.error(actionErrorMessage(err) ?? "Could not change the automation."),
  });
  const runNow = useActionMutation("run-automation-now", {
    onSuccess: () => toast.success("Daily check started. Results land in its run log."),
    onError: (err) => toast.error(actionErrorMessage(err) ?? "Could not start the check."),
  });

  function toggle(kind: "daily" | "repair", on: boolean) {
    const existing = kind === "daily" ? daily : repair;
    if (existing) {
      manage.mutate({ operation: "update", resourceId: existing.resourceId, enabled: on } as never);
      return;
    }
    const def = DESK_AUTOMATIONS[kind];
    manage.mutate({
      operation: "create",
      scope: "personal",
      enabled: true,
      ...def,
      ...(kind === "daily" ? { timezone: userTimeZone() } : {}),
    } as never);
  }

  const busy = manage.isPending || isPending;
  return (
    <section
      aria-label="Automations"
      className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs"
    >
      <span className="font-medium text-muted-foreground">Automations</span>
      <label className="inline-flex items-center gap-2">
        <Switch
          checked={Boolean(daily?.enabled)}
          disabled={busy}
          onCheckedChange={(on) => toggle("daily", on)}
          aria-label="Daily rules check"
        />
        <IconClockHour9 className="size-3.5 text-muted-foreground" />
        <span>Re-check every page daily at 9:00</span>
        {daily?.lastRun ? (
          <span className="text-muted-foreground">
            · last {relativeTime(daily.lastRun)} ({daily.lastStatus ?? "—"})
          </span>
        ) : null}
        {daily ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            disabled={runNow.isPending}
            onClick={() => runNow.mutate({ resourceId: daily.resourceId } as never)}
          >
            <IconPlayerPlay className="size-3" /> Run now
          </button>
        ) : null}
      </label>
      <label className="inline-flex items-center gap-2">
        <Switch
          checked={Boolean(repair?.enabled)}
          disabled={busy}
          onCheckedChange={(on) => toggle("repair", on)}
          aria-label="Auto-repair stale facts"
        />
        <IconBolt className="size-3.5 text-muted-foreground" />
        <span>When a page changes, the agent repairs stale facts</span>
        {repair?.lastRun ? (
          <span className="text-muted-foreground">
            · last {relativeTime(repair.lastRun)} ({repair.lastStatus ?? "—"})
          </span>
        ) : null}
      </label>
    </section>
  );
}

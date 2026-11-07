import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconChecklist,
  IconHistory,
  IconLoader2,
  IconPlus,
  IconRefresh,
} from "@tabler/icons-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { DeadlineTimeline } from "@/components/desk/DeadlineTimeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { countdown, formatInZone, relativeTime, userTimeZone } from "@/lib/rulebook";
import { cn } from "@/lib/utils";

function extractPrompt(name: string, id: string) {
  return `Extract the rules for "${name}" (rulebook ${id}). Read every source with read-source, then save every deadline, submission item, requirement, eligibility rule, judging criterion and prize with save-facts. Copy each quote verbatim and give deadlines as dueLocal + timeZone exactly as the page states them.`;
}

export default function DeskIndex() {
  const navigate = useNavigate();
  const { data, isPending } = useActionQuery("list-rulebooks", {});
  const [name, setName] = useState("");
  const [urls, setUrls] = useState("");
  const [asOf, setAsOf] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const tz = userTimeZone();

  const create = useActionMutation("create-rulebook", {
    onSuccess: (result) => {
      toast.success(result.message);
      setName("");
      setUrls("");
      setAsOf("");
      navigate(`/desk/${result.id}`);
      sendToAgentChat({
        message: extractPrompt(result.name, result.id),
        submit: true,
        openSidebar: true,
      });
    },
    onError: (error) =>
      toast.error(actionErrorMessage(error) ?? "Could not start tracking."),
  });
  const recheck = useActionMutation("check-sources", {
    onSuccess: (result) => toast.success(result.message),
    onError: (error) => toast.error(actionErrorMessage(error) ?? "Check failed."),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const list = urls
      .split(/\s+/)
      .map((u) => u.trim())
      .filter(Boolean)
      .slice(0, 5);
    if (!name.trim() || !list.length) {
      toast.error("Add a name and at least one rules URL.");
      return;
    }
    const ts = asOf.replace(/-/g, "");
    create.mutate({
      name: name.trim(),
      urls: list,
      ...(showArchive && /^\d{8}$/.test(ts) ? { asOf: ts } : {}),
    });
  }

  const books = data?.rulebooks ?? [];
  const timeline = books.flatMap((b) =>
    b.deadlines.map((d) => ({
      rulebookId: b.id,
      rulebookName: b.name,
      label: d.label,
      dueAt: d.dueAt,
      status: d.status,
    })),
  );

  return (
    <main className="desk flex min-h-full flex-col gap-5 p-4 sm:p-6">
      <form
        onSubmit={submit}
        className="grid gap-3 rounded-xl border border-border bg-card p-4 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(16rem,1.6fr)_auto] lg:items-end"
      >
        <div className="space-y-1.5">
          <Label htmlFor="rb-name">Contest or program</Label>
          <Input
            id="rb-name"
            placeholder="Agent-Native Hackathon"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rb-urls">Rules pages (one URL per line, up to 5)</Label>
          <Textarea
            id="rb-urls"
            rows={1}
            className="min-h-9 resize-y font-mono text-xs"
            placeholder="https://www.builder.io/hackathon/rules"
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={create.isPending} className="gap-1.5">
            {create.isPending ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconPlus className="size-4" />
            )}
            {create.isPending ? "Fetching pages…" : "Track & extract"}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground lg:col-span-3">
          <button
            type="button"
            className="inline-flex items-center gap-1 underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => setShowArchive((v) => !v)}
          >
            <IconHistory className="size-3.5" />
            {showArchive ? "Use today's pages" : "Start from an Internet Archive copy"}
          </button>
          {showArchive ? (
            <label className="inline-flex items-center gap-2">
              <span>Archived on</span>
              <Input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                className="h-7 w-40 text-xs"
              />
            </label>
          ) : null}
          <span className="ml-auto">
            The agent reads the pages and proposes facts with exact quotes. You approve.
          </span>
        </div>
      </form>

      {isPending ? (
        <Skeleton className="h-44 rounded-xl" />
      ) : (
        <DeadlineTimeline items={timeline} />
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          Tracked rulebooks
        </h2>
        {books.length ? (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            disabled={recheck.isPending}
            onClick={() => recheck.mutate({})}
          >
            <IconRefresh className={cn("size-4", recheck.isPending && "animate-spin")} />
            Check all pages now
          </Button>
        ) : null}
      </div>

      {isPending ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : books.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Paste a contest, grant or program rules URL above. The agent pulls out every
          deadline and requirement with the exact sentence it came from.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {books.map((b) => {
            const next = b.nextDeadline;
            const c = next ? countdown(next.dueAt) : null;
            const pct = b.requirementsTotal
              ? Math.round((b.requirementsDone / b.requirementsTotal) * 100)
              : 0;
            return (
              <Link
                key={b.id}
                to={`/desk/${b.id}`}
                className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="desk-serif min-w-0 truncate text-lg leading-tight">
                    {b.name}
                  </h3>
                  <IconArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                {next && c ? (
                  <div>
                    <div
                      className={cn(
                        "text-2xl font-semibold tabular-nums tracking-tight",
                        c.urgent && "text-[var(--desk-accent)]",
                        c.past && "text-muted-foreground",
                        next.status === "stale" && "text-[var(--desk-stale)]",
                      )}
                    >
                      {c.text}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {next.label} · {formatInZone(next.dueAt, tz)}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No upcoming deadline yet</div>
                )}
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {b.counts.stale ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--desk-stale-bg)] px-2 py-0.5 font-medium text-[var(--desk-stale)]">
                      <IconAlertTriangle className="size-3" />
                      {b.counts.stale} stale
                    </span>
                  ) : null}
                  {b.counts.proposed ? (
                    <span className="rounded-full bg-[var(--desk-accent-bg)] px-2 py-0.5 font-medium">
                      {b.counts.proposed} to review
                    </span>
                  ) : null}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                    {b.counts.approved} approved
                  </span>
                  {b.sourceErrors ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[var(--desk-stale)]">
                      {b.sourceErrors} page error
                    </span>
                  ) : null}
                </div>
                <div className="mt-auto flex items-center gap-2 text-[11px] text-muted-foreground">
                  <IconChecklist className="size-3.5" />
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-[var(--desk-verified)]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="tabular-nums">
                    {b.requirementsDone}/{b.requirementsTotal}
                  </span>
                  <span>· checked {relativeTime(b.lastCheckedAt)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}

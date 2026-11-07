import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
  useDbSync,
  writeClientAppState,
} from "@agent-native/core/client/hooks";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconChevronDown,
  IconHistory,
  IconRefresh,
  IconSparkles,
  IconWand,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";

import { EditFactDialog, type FactPatch } from "@/components/desk/EditFactDialog";
import { FactRow, type Fact } from "@/components/desk/FactRow";
import { SourcePane } from "@/components/desk/SourcePane";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatWayback,
  hostOf,
  KIND_LABEL,
  KIND_ORDER,
  relativeTime,
  userTimeZone,
} from "@/lib/rulebook";
import { TAB_ID } from "@/lib/tab-id";
import { cn } from "@/lib/utils";

type RulebookData = {
  facts: Fact[];
  [key: string]: unknown;
};

export default function RulebookRoute() {
  const { rulebookId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("fact");
  const queryClient = useQueryClient();
  const params = useMemo(() => ({ id: rulebookId }), [rulebookId]);
  const queryKey = ["action", "get-rulebook", params];
  const { data, isPending, error } = useActionQuery("get-rulebook", params);
  const [editing, setEditing] = useState<Fact | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [sourceTab, setSourceTab] = useState<string | null>(null);
  const userZone = userTimeZone();

  useDbSync({
    queryClient,
    realtime: {
      reason: "the scheduled rules check and agent automations can mark facts stale while this rulebook is open",
    },
    pauseWhenHidden: true,
  });

  // Flash rows the agent or the daily check just changed.
  const seen = useRef(new Map<string, string>());
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!data) return;
    const fresh = new Set<string>();
    for (const f of data.facts) {
      const prev = seen.current.get(f.id);
      if (seen.current.size && prev !== f.updatedAt && f.updatedBy !== "person") fresh.add(f.id);
      seen.current.set(f.id, f.updatedAt);
    }
    if (fresh.size) {
      setFlashIds(fresh);
      const t = setTimeout(() => setFlashIds(new Set()), 1800);
      return () => clearTimeout(t);
    }
  }, [data]);

  const selected = data?.facts.find((f) => f.id === selectedId) ?? null;

  // Tell the agent which fact the person is looking at.
  useEffect(() => {
    void writeClientAppState(
      `selection:${TAB_ID}`,
      selected
        ? { kind: "fact", id: selected.id, rulebookId, label: selected.label, status: selected.status }
        : { kind: "rulebook", id: rulebookId },
      { requestSource: TAB_ID },
    ).catch(() => {});
  }, [selected?.id, selected?.status, rulebookId]);

  const update = useActionMutation("update-fact", {
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: RulebookData | undefined) =>
        old && {
          ...old,
          facts: old.facts.map((f) =>
            f.id === input.id
              ? {
                  ...f,
                  ...(input.status ? { status: input.status } : {}),
                  ...(input.done !== undefined ? { done: input.done } : {}),
                  ...(input.label ? { label: input.label } : {}),
                  updatedBy: "person",
                }
              : f,
          ),
        },
      );
      return { previous };
    },
    onError: (err, _input, context) => {
      queryClient.setQueryData(queryKey, (context as { previous?: unknown } | undefined)?.previous);
      toast.error(actionErrorMessage(err) ?? "Could not update the fact.");
    },
    onSuccess: () => setEditing(null),
  });

  const check = useActionMutation("check-sources", {
    onSuccess: (result) => toast.success(result.message),
    onError: (err) => toast.error(actionErrorMessage(err) ?? "Check failed."),
  });

  if (isPending) {
    return (
      <main className="grid h-full gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <Skeleton className="h-10 w-2/3" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="hidden h-full rounded-xl lg:block" />
      </main>
    );
  }
  if (error || !data) {
    return (
      <main className="p-6">
        <p className="text-sm text-muted-foreground">Rulebook not found.</p>
        <Link to="/desk" className="mt-3 inline-block text-sm underline">
          Back to rulebooks
        </Link>
      </main>
    );
  }

  const facts = data.facts as Fact[];
  const stale = facts.filter((f) => f.status === "stale");
  const proposed = facts.filter((f) => f.status === "proposed");
  const latest = data.changes[0];
  const latestAffected = latest
    ? facts.filter((f) => latest.affectedFactIds.includes(f.id))
    : [];
  const activeSourceId =
    sourceTab ?? selected?.sourceId ?? data.sources[0]?.id ?? null;
  const activeSource = data.sources.find((s) => s.id === activeSourceId) ?? null;
  const addedSet = new Set(
    data.changes
      .filter((c) => c.sourceId === activeSourceId)
      .slice(0, 1)
      .flatMap((c) => c.added),
  );

  function select(fact: Fact) {
    setSourceTab(null);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (next.get("fact") === fact.id) next.delete("fact");
        else next.set("fact", fact.id);
        return next;
      },
      { replace: true },
    );
  }

  function askAgent(message: string) {
    sendToAgentChat({ message, submit: true, openSidebar: true });
  }

  const extractMsg = `Extract the rules for "${data.name}" (rulebook ${data.id}). Read every source with read-source, then save every deadline, submission item, requirement, eligibility rule, judging criterion and prize with save-facts. Skip anything already saved. Copy each quote verbatim and give deadlines as dueLocal + timeZone exactly as the page states them.`;
  const repairMsg = `The rules for "${data.name}" (rulebook ${data.id}) changed. For each stale fact, read the changed paragraphs with read-source, save the corrected fact with save-facts and a new verbatim quote, then reject the outdated one with update-fact. Tell me what changed in one line per fact.`;

  const groups = KIND_ORDER.map((kind) => ({
    kind,
    items: facts
      .filter((f) => f.kind === kind)
      .sort((a, b) => {
        const rank = (f: Fact) => (f.status === "rejected" ? 2 : f.status === "stale" ? -1 : 0);
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        return (a.dueAt ?? "~").localeCompare(b.dueAt ?? "~");
      }),
  })).filter((g) => g.items.length);

  return (
    <main className="desk grid h-full min-h-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <section className="flex min-h-0 flex-col overflow-y-auto">
        <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 pb-3 pt-4 backdrop-blur sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                to="/desk"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <IconArrowLeft className="size-3.5" /> Rulebooks
              </Link>
              <h1 className="desk-serif mt-1 truncate text-2xl leading-tight">{data.name}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={check.isPending}
                onClick={() => check.mutate({ rulebookId: data.id })}
              >
                <IconRefresh className={cn("size-4", check.isPending && "animate-spin")} />
                Check pages now
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => askAgent(extractMsg)}>
                <IconSparkles className="size-4" />
                {facts.length ? "Ask agent for missing facts" : "Extract with agent"}
              </Button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.sources.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSourceTab(s.id)}
                className={cn(
                  "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
                  s.id === activeSourceId
                    ? "border-foreground/40 bg-muted text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
                title={s.url}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    s.lastStatus === "ok"
                      ? "bg-[var(--desk-verified)]"
                      : s.lastStatus === "error"
                        ? "bg-[var(--desk-stale)]"
                        : "bg-muted-foreground",
                  )}
                />
                <span className="truncate">{hostOf(s.url)}{new URL(s.url).pathname.replace(/\/$/, "")}</span>
                <span className="text-muted-foreground">· {relativeTime(s.lastCheckedAt)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4 px-4 py-4 sm:px-6">
          {latest && (latest.affectedFactIds.length || latest.added.length || latest.removed.length) ? (
            <div
              className={cn(
                "rounded-xl border p-3",
                stale.length
                  ? "border-[var(--desk-stale)] bg-[var(--desk-stale-bg)]"
                  : "border-border bg-card",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                {stale.length ? (
                  <IconAlertTriangle className="size-4 text-[var(--desk-stale)]" />
                ) : (
                  <IconHistory className="size-4 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">
                  {latest.kind === "archive"
                    ? `Rules changed — Internet Archive copy of ${formatWayback(latest.archivedAt) ?? "a later date"}${latest.fromArchivedAt ? ` vs ${formatWayback(latest.fromArchivedAt)}` : ""}`
                    : `Rules changed ${relativeTime(latest.detectedAt)}`}
                </span>
                <span className="text-xs text-muted-foreground">
                  {latest.added.length} paragraph(s) added · {latest.removed.length} removed
                  {latestAffected.length ? ` · ${latestAffected.length} fact(s) now stale` : ""}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setShowDiff((v) => !v)}>
                    <IconChevronDown className={cn("size-3.5 transition-transform", showDiff && "rotate-180")} />
                    {showDiff ? "Hide diff" : "Show diff"}
                  </Button>
                  {stale.length ? (
                    <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => askAgent(repairMsg)}>
                      <IconWand className="size-3.5" /> Ask agent to repair
                    </Button>
                  ) : null}
                </div>
              </div>
              {showDiff ? (
                <div className="desk-quote mt-3 max-h-64 space-y-1.5 overflow-y-auto rounded-lg bg-background/70 p-3 text-[12.5px] leading-snug">
                  {latest.removed.map((p, i) => (
                    <p key={"r" + i} className="text-[var(--desk-stale)] line-through decoration-1">
                      − {p}
                    </p>
                  ))}
                  {latest.added.map((p, i) => (
                    <p key={"a" + i} className="text-[var(--desk-verified)]">
                      + {p}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {facts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No facts yet. The agent reads the pages and proposes each deadline and
                requirement with the exact sentence it came from.
              </p>
              <Button size="sm" className="mt-3 gap-1.5" onClick={() => askAgent(extractMsg)}>
                <IconSparkles className="size-4" /> Extract with agent
              </Button>
            </div>
          ) : (
            <>
              {proposed.length ? (
                <p className="text-xs text-muted-foreground">
                  {proposed.length} proposed fact(s) waiting for your review. Approve only what
                  the highlighted quote really says.
                </p>
              ) : null}
              {groups.map((g) => (
                <section key={g.kind} aria-label={KIND_LABEL[g.kind]}>
                  <h2 className="mb-1 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {KIND_LABEL[g.kind]}
                    <span className="font-normal tabular-nums">{g.items.length}</span>
                  </h2>
                  <div className="space-y-0.5">
                    {g.items.map((f) => (
                      <FactRow
                        key={f.id}
                        fact={f}
                        selected={f.id === selectedId}
                        flash={flashIds.has(f.id)}
                        userZone={userZone}
                        onSelect={() => select(f)}
                        onApprove={() => update.mutate({ id: f.id, status: "approved" })}
                        onReject={() => update.mutate({ id: f.id, status: "rejected" })}
                        onEdit={() => setEditing(f)}
                        onToggleDone={(done) => update.mutate({ id: f.id, done })}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      </section>

      <aside className="hidden min-h-0 border-l border-border lg:flex lg:flex-col">
        {activeSource ? (
          <SourcePane
            key={activeSource.id}
            source={activeSource}
            focusParagraph={selected && selected.sourceId === activeSource.id ? selected.quoteParagraph : null}
            quote={selected?.quote ?? null}
            addedParagraphs={addedSet}
          />
        ) : (
          <p className="p-6 text-sm text-muted-foreground">No pages tracked.</p>
        )}
      </aside>

      <EditFactDialog
        fact={editing}
        open={Boolean(editing)}
        pending={update.isPending}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSave={(patch: FactPatch) => {
          if (!editing) return;
          if (!Object.keys(patch).length) {
            setEditing(null);
            return;
          }
          update.mutate({ id: editing.id, ...patch });
        }}
      />
    </main>
  );
}

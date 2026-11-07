import { useMemo } from "react";
import { Link } from "react-router";

import { countdown, shortDate } from "@/lib/rulebook";
import { cn } from "@/lib/utils";

export interface TimelineItem {
  rulebookId: string;
  rulebookName: string;
  label: string;
  dueAt: string;
  status: string;
}

const DAY = 86_400_000;

/** Upcoming deadlines across every rulebook on one time axis. */
export function DeadlineTimeline({ items }: { items: TimelineItem[] }) {
  const now = Date.now();
  const { start, end, ticks, placed } = useMemo(() => {
    const upcoming = items
      .filter((i) => new Date(i.dueAt).getTime() >= now - DAY)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    const last = upcoming.length
      ? new Date(upcoming[upcoming.length - 1]!.dueAt).getTime()
      : now + 30 * DAY;
    const startMs = now - DAY;
    const endMs = Math.max(last + 3 * DAY, now + 21 * DAY);
    const span = endMs - startMs;
    const tickCount = 6;
    const ticks = Array.from({ length: tickCount + 1 }, (_, i) => startMs + (span * i) / tickCount);
    const lanes: number[] = [];
    const placed = upcoming.map((item) => {
      const x = ((new Date(item.dueAt).getTime() - startMs) / span) * 100;
      let lane = 0;
      while (lanes[lane] !== undefined && x - lanes[lane]! < 14) lane++;
      lanes[lane] = x;
      return { ...item, x, lane: Math.min(lane, 3) };
    });
    return { start: startMs, end: endMs, ticks, placed };
  }, [items, now]);

  const todayX = ((now - start) / (end - start)) * 100;

  return (
    <section
      aria-label="Upcoming deadlines"
      className="rounded-xl border border-border bg-card px-4 pb-3 pt-4"
    >
      <div className="relative h-36">
        {placed.length === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Deadlines you approve or review show up here.
          </p>
        ) : null}
        <div className="absolute inset-x-0 bottom-6 h-px bg-border" />
        <div
          className="absolute bottom-6 top-0 w-px bg-[var(--desk-accent)]"
          style={{ left: `${todayX}%` }}
          aria-hidden
        >
          <span className="absolute -top-0.5 left-1 text-[10px] font-medium uppercase tracking-wide text-[var(--desk-accent)]">
            now
          </span>
        </div>
        {placed.map((item) => {
          const c = countdown(item.dueAt, now);
          return (
            <Link
              key={item.rulebookId + item.label + item.dueAt}
              to={`/desk/${item.rulebookId}`}
              className="group absolute -translate-x-1/2"
              style={{ left: `${item.x}%`, bottom: `${24 + 8 + item.lane * 26}px` }}
            >
              <span
                className={cn(
                  "flex max-w-44 items-center gap-1.5 truncate rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-sm transition-colors",
                  item.status === "stale"
                    ? "border-[var(--desk-stale)] bg-[var(--desk-stale-bg)] text-[var(--desk-stale)]"
                    : c.urgent
                      ? "border-[var(--desk-accent)] bg-[var(--desk-accent-bg)] text-foreground"
                      : "border-border bg-background text-foreground group-hover:border-foreground/40",
                )}
                title={`${item.rulebookName} — ${item.label} (${c.text})`}
              >
                <span className="truncate">{item.rulebookName}</span>
                <span className="text-muted-foreground">· {shortDate(item.dueAt)}</span>
              </span>
            </Link>
          );
        })}
        {placed.map((item) => (
          <span
            key={"dot" + item.rulebookId + item.label + item.dueAt}
            className={cn(
              "absolute bottom-[21px] size-2 -translate-x-1/2 rounded-full",
              item.status === "stale" ? "bg-[var(--desk-stale)]" : "bg-foreground",
            )}
            style={{ left: `${item.x}%` }}
            aria-hidden
          />
        ))}
        <div className="absolute inset-x-0 bottom-0 h-5">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute -translate-x-1/2 text-[10px] tabular-nums text-muted-foreground"
              style={{ left: `${((t - start) / (end - start)) * 100}%` }}
            >
              {shortDate(new Date(t).toISOString())}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

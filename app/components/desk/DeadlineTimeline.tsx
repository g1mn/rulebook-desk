import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";

import { useDeskI18n } from "@/hooks/use-desk-i18n";
import { factCountdown, isDateOnly, shortDate } from "@/lib/rulebook";
import { cn } from "@/lib/utils";

export interface TimelineItem {
  rulebookId: string;
  rulebookName: string;
  label: string;
  /** Start of the day in the page's zone for a date-only deadline: position only, never shown as a time. */
  dueAt: string;
  dueLocal: string | null;
  dueTimeZone: string | null;
  status: string;
}

const DAY = 86_400_000;

/** Upcoming deadlines across every rulebook on one time axis. */
export function DeadlineTimeline({ items }: { items: TimelineItem[] }) {
  const now = Date.now();
  const { t, locale } = useDeskI18n();
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth || 1000));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // Chips are at most max-w-44 (176px) wide. Lanes remember the right edge of their last
  // chip, using the same anchor (left, centre or right) the chip is drawn with.
  const chip = Math.min(60, (184 / Math.max(width, 200)) * 100);
  const { start, end, ticks, placed, hidden } = useMemo(() => {
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
    const placed: (TimelineItem & { x: number; lane: number })[] = [];
    let hidden = 0;
    for (const item of upcoming) {
      const x = ((new Date(item.dueAt).getTime() - startMs) / span) * 100;
      const left = x < 12 ? x : x > 88 ? x - chip : x - chip / 2;
      let lane = 0;
      while (lanes[lane] !== undefined && left < lanes[lane]!) lane++;
      if (lane > 3) {
        hidden++;
        continue;
      }
      lanes[lane] = left + chip;
      placed.push({ ...item, x, lane });
    }
    return { start: startMs, end: endMs, ticks, placed, hidden };
  }, [items, now, chip]);

  const todayX = ((now - start) / (end - start)) * 100;

  return (
    <section
      aria-label={t("desk.timeline.label")}
      className="overflow-hidden rounded-xl border border-border bg-card px-4 pb-3 pt-4"
    >
      <div ref={boxRef} className="relative h-36">
        {placed.length === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            {t("desk.timeline.empty")}
          </p>
        ) : null}
        {hidden ? (
          <span className="absolute right-0 top-0 text-[10px] text-muted-foreground">
            {t("desk.timeline.more", { n: hidden })}
          </span>
        ) : null}
        <div className="absolute inset-x-0 bottom-6 h-px bg-border" />
        <div
          className="absolute bottom-6 top-0 w-px bg-[var(--desk-accent)]"
          style={{ left: `${todayX}%` }}
          aria-hidden
        >
          <span className="absolute -top-0.5 left-1 whitespace-nowrap text-[10px] font-medium uppercase tracking-wide text-[var(--desk-accent)]">
            {t("desk.timeline.now")}
          </span>
        </div>
        {placed.map((item) => {
          const c = factCountdown(item, t, now);
          return (
            <Link
              key={item.rulebookId + item.label + item.dueAt}
              to={`/desk/${item.rulebookId}`}
              className={cn(
                "group absolute",
                item.x < 12 ? "translate-x-0" : item.x > 88 ? "-translate-x-full" : "-translate-x-1/2",
              )}
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
                title={t("desk.timeline.chipTitle", {
                  name: item.rulebookName,
                  label: item.label,
                  countdown: c.text,
                })}
              >
                <span className="truncate">{item.rulebookName}</span>
                <span className="text-muted-foreground">
                  ·{" "}
                  {isDateOnly(item.dueLocal)
                    ? shortDate(`${item.dueLocal.trim()}T00:00:00Z`, "UTC", locale)
                    : shortDate(item.dueAt, undefined, locale)}
                </span>
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
          {ticks.map((tick, i) => (
            <span
              key={tick}
              className={cn(
                "absolute whitespace-nowrap text-[10px] tabular-nums text-muted-foreground",
                // first and last labels stay inside the box (long dates such as "8 de nov." or "11月8日")
                i === 0 ? "translate-x-0" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2",
              )}
              style={{ left: `${((tick - start) / (end - start)) * 100}%` }}
            >
              {shortDate(new Date(tick).toISOString(), undefined, locale)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

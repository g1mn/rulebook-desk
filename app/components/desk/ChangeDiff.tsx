import { useDeskI18n } from "@/hooks/use-desk-i18n";
import { pairChanges, wordDiff, type DiffPart } from "@/lib/word-diff";
import { cn } from "@/lib/utils";

export function InlineDiff({ parts, className }: { parts: DiffPart[]; className?: string }) {
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.kind === "same" ? (
          <span key={i}>{p.text}</span>
        ) : p.kind === "del" ? (
          <del
            key={i}
            className="rounded-sm bg-[var(--desk-stale-bg)] px-0.5 text-[var(--desk-stale)] decoration-1"
          >
            {p.text}
          </del>
        ) : (
          <ins
            key={i}
            className="rounded-sm bg-[var(--desk-verified-bg)] px-0.5 font-medium text-[var(--desk-verified)] no-underline"
          >
            {p.text}
          </ins>
        ),
      )}
    </span>
  );
}

/** Changed paragraphs: edited ones as one line with word-level marks. */
export function ChangeDiff({ removed, added }: { removed: string[]; added: string[] }) {
  const { t } = useDeskI18n();
  const { pairs, lonelyRemoved, lonelyAdded } = pairChanges(removed, added);
  return (
    <div className="desk-quote mt-3 max-h-72 space-y-2 overflow-y-auto rounded-lg bg-background/70 p-3 text-[13px] leading-snug">
      {pairs.map((p, i) => (
        <p key={"p" + i} className="text-foreground/85">
          <span className="mr-1.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("desk.diff.edited")}
          </span>
          <InlineDiff parts={wordDiff(p.before, p.after)} />
        </p>
      ))}
      {lonelyRemoved.map((p, i) => (
        <p key={"r" + i} className={cn("text-[var(--desk-stale)] line-through decoration-1")}>
          − {p}
        </p>
      ))}
      {lonelyAdded.map((p, i) => (
        <p key={"a" + i} className="text-[var(--desk-verified)]">
          + {p}
        </p>
      ))}
    </div>
  );
}

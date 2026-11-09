import {
  IconAlertTriangle,
  IconCheck,
  IconCircleCheck,
  IconCircleDashed,
  IconPencil,
  IconQuote,
  IconX,
} from "@tabler/icons-react";

import { InlineDiff } from "@/components/desk/ChangeDiff";
import { Checkbox } from "@/components/ui/checkbox";
import { wordDiff } from "@/lib/word-diff";
import { useDeskI18n } from "@/hooks/use-desk-i18n";
import {
  countdown,
  editorInline,
  editorLabel,
  formatInZone,
  localizeStaleReason,
  statusLabel,
  utcText,
  zoneAbbrev,
} from "@/lib/rulebook";
import { cn } from "@/lib/utils";

export interface Fact {
  id: string;
  sourceId: string | null;
  kind: string;
  label: string;
  detail: string | null;
  dueLocal: string | null;
  dueTimeZone: string | null;
  dueAt: string | null;
  quote: string | null;
  quoteStatus: "verified" | "unverified" | "none";
  quoteParagraph: number | null;
  status: "proposed" | "approved" | "rejected" | "stale";
  staleReason: string | null;
  done: boolean;
  createdBy: string;
  updatedBy: string;
  updatedAt: string;
}

const STATUS_STYLE: Record<Fact["status"], string> = {
  proposed: "bg-[var(--desk-accent-bg)] text-foreground",
  approved: "bg-[var(--desk-verified-bg)] text-[var(--desk-verified)]",
  rejected: "bg-muted text-muted-foreground line-through",
  stale: "bg-[var(--desk-stale-bg)] text-[var(--desk-stale)]",
};

export function FactRow({
  fact,
  selected,
  flash,
  userZone,
  onSelect,
  onApprove,
  onReject,
  onEdit,
  onToggleDone,
  nowSays = null,
}: {
  fact: Fact;
  selected: boolean;
  flash: boolean;
  userZone: string;
  onSelect: () => void;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
  onToggleDone: (done: boolean) => void;
  /** For a stale fact: the new paragraph that most likely replaced its quote. */
  nowSays?: string | null;
}) {
  const { t, locale } = useDeskI18n();
  const isChecklist = fact.kind === "requirement" || fact.kind === "submission";
  const c = fact.dueAt ? countdown(fact.dueAt, t) : null;
  const provenance =
    fact.createdBy === fact.updatedBy
      ? editorLabel(fact.createdBy, t)
      : t("desk.fact.editedBy", {
          creator: editorLabel(fact.createdBy, t),
          editor: editorInline(fact.updatedBy, t),
        });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        // Only the row itself: Enter/Space on Approve, Edit or the checkbox must reach them.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      data-fact-id={fact.id}
      className={cn(
        "group grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-[var(--desk-accent)] bg-[var(--desk-accent-bg)]"
          : "border-transparent hover:bg-muted/50",
        fact.status === "rejected" && "opacity-55",
        flash && "desk-flash",
      )}
    >
      <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
        {isChecklist && fact.status === "approved" ? (
          <Checkbox
            checked={fact.done}
            onCheckedChange={(v) => onToggleDone(v === true)}
            aria-label={t("desk.fact.markDone", { label: fact.label })}
          />
        ) : fact.quoteStatus === "verified" ? (
          <IconCircleCheck
            className="size-4 text-[var(--desk-verified)]"
            aria-label={t("desk.fact.quoteVerified")}
          />
        ) : fact.status === "stale" ? (
          <IconAlertTriangle
            className="size-4 text-[var(--desk-stale)]"
            aria-label={statusLabel("stale", t)}
          />
        ) : (
          <IconCircleDashed
            className="size-4 text-muted-foreground"
            aria-label={t("desk.fact.noVerifiedQuote")}
          />
        )}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span
            className={cn(
              "text-sm font-medium",
              fact.done && "text-muted-foreground line-through",
            )}
          >
            {fact.label}
          </span>
          <span
            className={cn(
              "rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide",
              STATUS_STYLE[fact.status],
            )}
          >
            {statusLabel(fact.status, t)}
          </span>
        </div>

        {fact.dueAt && c ? (
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs">
            <span
              className={cn(
                "font-semibold tabular-nums",
                c.urgent && "text-[var(--desk-accent)]",
                c.past && "text-muted-foreground",
              )}
            >
              {c.text}
            </span>
            <span className="tabular-nums text-foreground/90">
              {formatInZone(fact.dueAt, userZone, locale)}
            </span>
            {fact.dueTimeZone && fact.dueTimeZone !== userZone ? (
              <span className="tabular-nums text-muted-foreground">
                {t("desk.fact.pageSays", {
                  time: formatInZone(fact.dueAt, fact.dueTimeZone, locale),
                })}
              </span>
            ) : null}
            <span className="tabular-nums text-muted-foreground">
              {utcText(fact.dueAt)}
            </span>
          </div>
        ) : null}

        {fact.detail ? (
          <p className="mt-1 text-xs text-muted-foreground">{fact.detail}</p>
        ) : null}

        {fact.quote ? (
          <p
            className={cn(
              "desk-quote mt-1.5 line-clamp-2 border-l-2 pl-2 text-[12.5px] italic leading-snug",
              fact.quoteStatus === "verified"
                ? "border-[var(--desk-verified)] text-foreground/75"
                : "border-[var(--desk-stale)] text-[var(--desk-stale)]",
            )}
          >
            <IconQuote className="mr-1 inline size-3 -translate-y-px opacity-60" />
            {fact.quote}
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t("desk.fact.noQuote")}
          </p>
        )}

        {fact.status === "stale" && fact.quote && nowSays ? (
          <p className="desk-quote mt-1.5 rounded-md bg-background/60 px-2 py-1 text-[12.5px] leading-snug">
            <span className="mr-1.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("desk.fact.pageNowSays")}
            </span>
            <InlineDiff parts={wordDiff(fact.quote, nowSays).filter((p) => p.kind !== "del" || p.text.trim())} />
          </p>
        ) : null}

        {fact.status === "stale" && fact.staleReason ? (
          <p className="mt-1 text-[11px] font-medium text-[var(--desk-stale)]">
            {localizeStaleReason(fact.staleReason, t, locale)}
          </p>
        ) : null}

        <div className="mt-1 flex flex-wrap gap-x-2 text-[10.5px] text-muted-foreground">
          <span>{provenance}</span>
          {fact.quoteStatus === "verified" && fact.quoteParagraph != null ? (
            <span>· ¶{fact.quoteParagraph}</span>
          ) : null}
          {fact.dueTimeZone ? (
            <span>
              ·{" "}
              {t("desk.fact.utcInCode", {
                zone: zoneAbbrev(fact.dueAt ?? new Date().toISOString(), fact.dueTimeZone),
              })}
            </span>
          ) : null}
        </div>
      </div>

      <div
        className="flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        {fact.status !== "approved" ? (
          <button
            type="button"
            onClick={onApprove}
            disabled={fact.quoteStatus !== "verified"}
            title={
              fact.quoteStatus === "verified"
                ? t("desk.fact.approve")
                : t("desk.fact.approveDisabled")
            }
            className="inline-flex size-7 items-center justify-center rounded-md text-[var(--desk-verified)] hover:bg-[var(--desk-verified-bg)] disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={t("desk.fact.approve")}
          >
            <IconCheck className="size-4" />
          </button>
        ) : null}
        {fact.status !== "rejected" ? (
          <button
            type="button"
            onClick={onReject}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("desk.fact.reject")}
            title={t("desk.fact.reject")}
          >
            <IconX className="size-4" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t("desk.fact.edit")}
          title={t("desk.fact.edit")}
        >
          <IconPencil className="size-4" />
        </button>
      </div>
    </div>
  );
}

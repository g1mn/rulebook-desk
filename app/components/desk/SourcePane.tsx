import { useActionQuery } from "@agent-native/core/client/hooks";
import { IconExternalLink, IconQuote } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeskI18n } from "@/hooks/use-desk-i18n";
import { formatWayback, hostOf, relativeTime } from "@/lib/rulebook";
import { cn } from "@/lib/utils";

function normalize(s: string) {
  return s
    .normalize("NFKC")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Wrap the quoted span of a paragraph in a highlighter mark. */
function Highlighted({ text, quote }: { text: string; quote: string | null }) {
  if (!quote) return <>{text}</>;
  const q = normalize(quote).trim();
  // Build a normalized copy with an index map back to the original string.
  let norm = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = normalize(text[i]!);
    if (ch === " " && norm.endsWith(" ")) continue;
    for (const c of ch) {
      norm += c;
      map.push(i);
    }
  }
  const at = norm.indexOf(q);
  if (at === -1) return <mark className="desk-mark text-foreground">{text}</mark>;
  const start = map[at] ?? 0;
  const end = (map[Math.min(at + q.length - 1, map.length - 1)] ?? text.length - 1) + 1;
  return (
    <>
      {text.slice(0, start)}
      <mark className="desk-mark text-foreground">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}

export interface SourcePaneSource {
  id: string;
  url: string;
  title: string | null;
  lastCheckedAt: string | null;
  lastStatus: string;
  lastError: string | null;
  archivedAt?: string | null;
}

export function SourcePane({
  source,
  focusParagraph,
  quote,
  addedParagraphs,
  onQuote,
}: {
  source: SourcePaneSource;
  focusParagraph: number | null;
  quote: string | null;
  addedParagraphs: Set<string>;
  /** Called with the selected page text when the person saves it as a fact. */
  onQuote?: (text: string) => void;
}) {
  const { data, isPending, error } = useActionQuery("read-source", {
    sourceId: source.id,
    limit: 500,
  });
  const { t, locale } = useDeskI18n();
  const listRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState("");

  function captureSelection() {
    const sel = window.getSelection();
    const text = sel?.toString().replace(/\s+/g, " ").trim() ?? "";
    const inside =
      sel?.anchorNode && listRef.current?.contains(sel.anchorNode);
    setSelection(inside && text.length >= 6 ? text.slice(0, 800) : "");
  }

  useEffect(() => {
    if (focusParagraph == null || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-paragraph="${focusParagraph}"]`,
    );
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusParagraph, data]);

  const added = useMemo(
    () => new Set([...addedParagraphs].map((p) => normalize(p).trim())),
    [addedParagraphs],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-xs">
        <span className="min-w-0 flex-1 truncate font-medium">
          {source.title || hostOf(source.url)}
        </span>
        <span className="shrink-0 text-muted-foreground">
          {source.archivedAt
            ? t("desk.source.archiveCopy", { date: formatWayback(source.archivedAt, locale) })
            : source.lastCheckedAt
              ? t("desk.source.fetchedAgo", { when: relativeTime(source.lastCheckedAt, t) })
              : t("desk.source.fetchedNever")}
        </span>
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={t("desk.source.openLive")}
        >
          <IconExternalLink className="size-3.5" />
        </a>
      </div>
      <div
        ref={listRef}
        onMouseUp={onQuote ? captureSelection : undefined}
        onKeyUp={onQuote ? captureSelection : undefined}
        className="desk-quote min-h-0 flex-1 overflow-y-auto bg-[var(--desk-paper)] px-5 py-4 text-[13.5px] leading-relaxed"
      >
        {isPending ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-muted-foreground">
            {source.lastError ?? t("desk.source.notFetched")}
          </p>
        ) : (
          data?.paragraphs.map((p) => {
            const focused = p.i === focusParagraph;
            const isNew = added.has(normalize(p.text).trim());
            return (
              <p
                key={p.i}
                data-paragraph={p.i}
                className={cn(
                  "relative mb-2.5 rounded-sm pl-8 text-foreground/80",
                  focused && "text-foreground",
                  isNew && "border-l-2 border-[var(--desk-verified)] pl-[30px]",
                )}
              >
                <span className="absolute left-0 top-0.5 w-6 select-none text-right font-sans text-[10px] tabular-nums text-muted-foreground/70">
                  ¶{p.i}
                </span>
                {focused ? <Highlighted text={p.text} quote={quote} /> : p.text}
              </p>
            );
          })
        )}
      </div>
      {onQuote && selection ? (
        <div className="flex items-center gap-2 border-t border-border bg-background px-4 py-2 text-xs">
          <IconQuote className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="desk-quote min-w-0 flex-1 truncate italic text-muted-foreground">
            {selection}
          </span>
          <Button
            size="sm"
            className="h-7 shrink-0 text-xs"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onQuote(selection);
              setSelection("");
            }}
          >
            {t("desk.source.saveAsFact")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

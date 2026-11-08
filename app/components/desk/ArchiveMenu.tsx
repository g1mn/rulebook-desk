import { useActionQuery } from "@agent-native/core/client/hooks";
import { IconHistory, IconLoader2 } from "@tabler/icons-react";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDeskI18n } from "@/hooks/use-desk-i18n";
import { formatWayback, hostOf } from "@/lib/rulebook";

/** Internet Archive copies of one page; picking one replays it as a check. */
export function ArchiveMenu({
  sourceId,
  url,
  pending,
  onReplay,
}: {
  sourceId: string;
  url: string;
  pending: boolean;
  onReplay: (timestamp: string) => void;
}) {
  const { t, locale } = useDeskI18n();
  const [open, setOpen] = useState(false);
  const { data, isPending, error } = useActionQuery(
    "list-archive-copies",
    { sourceId },
    { enabled: open, staleTime: 10 * 60_000 },
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          disabled={pending}
        >
          {pending ? (
            <IconLoader2 className="size-3 animate-spin" />
          ) : (
            <IconHistory className="size-3" />
          )}
          {t("desk.archive.button")}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <p className="px-2 pb-2 text-[11px] text-muted-foreground">
          {t("desk.archive.intro", { host: hostOf(url) })}
        </p>
        {isPending ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">{t("desk.archive.loading")}</p>
        ) : error ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">{t("desk.archive.failed")}</p>
        ) : !data?.copies.length ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">{t("desk.archive.none")}</p>
        ) : (
          <ul className="max-h-64 overflow-y-auto">
            {[...data.copies].reverse().map((c) => (
              <li key={c.timestamp}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                  onClick={() => {
                    setOpen(false);
                    onReplay(c.timestamp);
                  }}
                >
                  <span>{formatWayback(c.timestamp, locale)}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{c.timestamp.slice(8, 12)} UTC</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

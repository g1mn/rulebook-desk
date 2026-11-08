export const KIND_ORDER = [
  "deadline",
  "submission",
  "requirement",
  "eligibility",
  "judging",
  "prize",
  "other",
] as const;
export type FactKind = (typeof KIND_ORDER)[number];

/** i18next-style translate function (useT() on screens, getFixedT in tests). */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

export function userTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const AOE = "AoE (UTC−12)";

export function formatInZone(iso: string, timeZone: string, locale = "en-US"): string {
  const date = new Date(iso);
  const parts = {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  } as const;
  if (locale !== "en-US") {
    // Other languages: Intl names the place in that language ("로스앤젤레스 시간",
    // "ロサンゼルス時間", "洛杉矶时间"); UTC and fixed offsets keep the short form.
    const fixed = timeZone === "UTC" || timeZone.startsWith("Etc/");
    const text = new Intl.DateTimeFormat(locale, {
      ...parts,
      timeZoneName: fixed ? "short" : "shortGeneric",
    }).format(date);
    return timeZone === "Etc/GMT+12" ? text.replace(/GMT-12(:00)?/, AOE) : text;
  }
  const text = new Intl.DateTimeFormat("en-US", { ...parts, timeZoneName: "short" }).format(date);
  // "GMT+9" says little; name the city instead ("Seoul time").
  if (timeZone === "Etc/GMT+12") return text.replace(/GMT-12/, AOE);
  if (/GMT[+-]\d/.test(text) && timeZone.includes("/") && !timeZone.startsWith("Etc/")) {
    const city = timeZone.split("/").pop()!.replace(/_/g, " ");
    return text.replace(/GMT[+-][\d:]+/, `${city} time`);
  }
  return text;
}

export function shortDate(iso: string, timeZone?: string, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export function zoneAbbrev(iso: string, timeZone: string): string {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
  })
    .formatToParts(new Date(iso))
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? timeZone;
}

/** "2d 14h left", "3h 05m left", "closed 4d ago" (in the screen's language). */
export function countdown(
  iso: string,
  t: Translate,
  now = Date.now(),
): {
  text: string;
  past: boolean;
  urgent: boolean;
} {
  const diff = new Date(iso).getTime() - now;
  const past = diff < 0;
  const abs = Math.abs(diff);
  const d = Math.floor(abs / 86_400_000);
  const h = Math.floor((abs % 86_400_000) / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const span =
    d > 0
      ? t("desk.time.spanDays", { d, h })
      : h > 0
        ? t("desk.time.spanHours", { h, m, mm: String(m).padStart(2, "0") })
        : t("desk.time.spanMinutes", { m });
  return {
    text: t(past ? "desk.time.closed" : "desk.time.left", { span }),
    past,
    urgent: !past && diff < 3 * 86_400_000,
  };
}

export function relativeTime(iso: string | null, t: Translate, now = Date.now()): string {
  if (!iso) return t("desk.time.never");
  const diff = now - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return t("desk.time.justNow");
  if (min < 60) return t("desk.time.minutesAgo", { n: min });
  const h = Math.round(min / 60);
  if (h < 48) return t("desk.time.hoursAgo", { n: h });
  return t("desk.time.daysAgo", { n: Math.round(h / 24) });
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function editorLabel(by: string, t: Translate): string {
  if (by === "person") return t("desk.editor.person");
  if (by === "automation") return t("desk.editor.automation");
  return t("desk.editor.agent");
}

export function kindLabel(kind: string, t: Translate): string {
  return t(`desk.kind.${(KIND_ORDER as readonly string[]).includes(kind) ? kind : "other"}`);
}

export function kindSingular(kind: string, t: Translate): string {
  return t(`desk.kindSingular.${(KIND_ORDER as readonly string[]).includes(kind) ? kind : "other"}`);
}

export function statusLabel(status: string, t: Translate): string {
  return ["proposed", "approved", "rejected", "stale"].includes(status)
    ? t(`desk.status.${status}`)
    : status;
}

/** Automation run status ("success", "error", ...) in the screen's language. */
export function runStatusLabel(status: string, t: Translate): string {
  return ["success", "error", "running", "skipped"].includes(status)
    ? t(`desk.automations.runStatus.${status}`)
    : status;
}

export function formatWayback(ts: string | null, locale = "en-US"): string | null {
  if (!ts) return null;
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(ts);
  if (!m) return ts;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)));
}

/**
 * The server stores a stale reason in English (it is also what the agent
 * reads). Show the two known shapes in the screen's language; anything else
 * is shown as stored.
 */
export function localizeStaleReason(reason: string, t: Translate, locale = "en-US"): string {
  const archive = /^Quote is gone from the Internet Archive copy of (\S+) dated (\d{4})-(\d{2})-(\d{2})\.$/.exec(
    reason,
  );
  if (archive) {
    const date = formatWayback(`${archive[2]}${archive[3]}${archive[4]}`, locale);
    return t("desk.fact.staleArchive", { host: archive[1], date });
  }
  const live = /^Quote no longer appears on (\S+) \(checked (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) UTC\)\.$/.exec(reason);
  if (live) return t("desk.fact.staleLive", { host: live[1], time: live[2] });
  return reason;
}

/** Toast after "Check pages now" / an archive replay, built from the result. */
export function checkSummary(
  result: { results: { status: string; staleFactIds: string[] }[]; pinned?: number | undefined },
  asOf: string | undefined,
  t: Translate,
  locale = "en-US",
): string {
  const pinned = result.pinned ?? 0;
  if (!result.results.length && !pinned) return t("desk.check.noRulebooks");
  const changed = result.results.filter((r) => r.status === "changed").length;
  const stale = result.results.reduce((n, r) => n + r.staleFactIds.length, 0);
  const errors = result.results.filter((r) => r.status === "error").length;
  return [
    asOf ? t("desk.check.loadedArchive", { date: formatWayback(asOf, locale) }) : "",
    t("desk.check.checkedPages", { count: result.results.length, changed }),
    stale ? t("desk.check.staleFacts", { count: stale }) : "",
    errors ? t("desk.check.failedPages", { count: errors }) : "",
    pinned ? t("desk.check.skippedPinned", { count: pinned }) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Toast after save-facts from the screen (hand-added or "Save as fact"). */
export function saveSummary(
  result: { saved: unknown[]; rejected: { reason: string }[] },
  t: Translate,
): { ok: boolean; text: string } {
  const first = result.rejected[0];
  if (first)
    return {
      ok: false,
      text: first.reason.startsWith("Quote not found")
        ? t("desk.rulebook.quoteNotOnPage")
        : t("desk.rulebook.notSaved", { reason: first.reason }),
    };
  return { ok: true, text: t("desk.rulebook.savedFacts", { count: result.saved.length }) };
}

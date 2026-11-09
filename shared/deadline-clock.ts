/**
 * Deadline times computed in code, shared by the screen, the actions and the
 * agent's context. The screen renders these strings; the agent is told to
 * quote them and never to do date or time arithmetic itself (a model once
 * wrote "today, in about 18 hours" for a deadline 26 hours away).
 */

/** i18next-style translate function (useT() on screens, getFixedT in tests, deskTimeT on the server). */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

const AOE = "AoE (UTC−12)";
// Intl writes the -12 offset as "GMT-12" in most languages and "UTC−12" in French.
const MINUS_12 = /(?:GMT|UTC)[-−]12(?::00)?/;

/**
 * How the place is named after the time. "shortGeneric" gives a city or
 * country ("로스앤젤레스 시간", "hora de Los Ángeles"); Traditional Chinese and
 * Vietnamese only get "PT" from it, so they use the longer generic name.
 */
function zoneNameStyle(locale: string, fixed: boolean): "short" | "shortGeneric" | "longGeneric" {
  if (fixed) return "short";
  return /^(zh-TW|vi)/.test(locale) ? "longGeneric" : "shortGeneric";
}

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
      timeZoneName: zoneNameStyle(locale, fixed),
    }).format(date);
    return timeZone === "Etc/GMT+12" ? text.replace(MINUS_12, AOE) : text;
  }
  const text = new Intl.DateTimeFormat("en-US", { ...parts, timeZoneName: "short" }).format(date);
  // "GMT+9" says little; name the city instead ("Seoul time").
  if (timeZone === "Etc/GMT+12") return text.replace(MINUS_12, AOE);
  if (/GMT[+-]\d/.test(text) && timeZone.includes("/") && !timeZone.startsWith("Etc/")) {
    const city = timeZone.split("/").pop()!.replace(/_/g, " ");
    return text.replace(/GMT[+-][\d:]+/, `${city} time`);
  }
  return text;
}

/** "2026-11-10 07:59 UTC", the UTC line under each deadline. */
export function utcText(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
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
  /** Whole minutes to the deadline; negative once it has passed. */
  minutes: number;
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
  const minutes = Math.floor(abs / 60_000);
  return {
    text: t(past ? "desk.time.closed" : "desk.time.left", { span }),
    past,
    urgent: !past && diff < 3 * 86_400_000,
    minutes: past ? -minutes : minutes,
  };
}

/** Everything the screen shows for one deadline, as the agent should quote it. */
export interface DeadlineClock {
  /** UTC instant (ISO) the app computed from the page's wall-clock time. */
  dueAt: string;
  /** "2026-11-10 07:59 UTC". */
  utc: string;
  /** The deadline in the person's own zone and language. */
  yourTime: string;
  /** The deadline in the zone the page states, or null when the page gave none. */
  pageTime: string | null;
  /** "1d 2h left" / "closed 3h 05m ago", exactly as the screen shows it. */
  timeLeft: string;
  past: boolean;
  /** Whole minutes to the deadline; negative once it has passed. */
  minutesLeft: number;
}

export function deadlineClock(
  dueAt: string,
  opts: {
    t: Translate;
    locale: string;
    viewerTimeZone: string;
    pageTimeZone?: string | null;
    now?: number;
  },
): DeadlineClock {
  const c = countdown(dueAt, opts.t, opts.now ?? Date.now());
  return {
    dueAt: new Date(dueAt).toISOString(),
    utc: utcText(dueAt),
    yourTime: formatInZone(dueAt, opts.viewerTimeZone, opts.locale),
    pageTime: opts.pageTimeZone ? formatInZone(dueAt, opts.pageTimeZone, opts.locale) : null,
    timeLeft: c.text,
    past: c.past,
    minutesLeft: c.minutes,
  };
}

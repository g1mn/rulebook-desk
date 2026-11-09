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

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/**
 * A deadline the page gives as a date with no time ("October 27, 2026 :
 * Hackathon begins") is saved as dueLocal "YYYY-MM-DD". Its dueAt is the start
 * of that day in the page's zone, for sorting and the timeline only: the page
 * never said midnight, so no screen text or agent value shows a time for it.
 */
export function isDateOnly(dueLocal: string | null | undefined): dueLocal is string {
  return typeof dueLocal === "string" && DATE_ONLY.test(dueLocal.trim());
}

/** "Tue, Oct 27, 2026": the page's calendar date, no time and no zone conversion. */
export function formatDate(date: string, locale = "en-US"): string {
  const [y, m, d] = date.trim().split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Date.UTC(y!, m! - 1, d!)));
}

/** "Tue, Oct 27, 2026 (no time given)" in the screen's language. */
export function dateOnlyText(date: string, t: Translate, locale = "en-US"): string {
  return t("desk.time.dateNoTime", { date: formatDate(date, locale) });
}

/** The calendar date ("YYYY-MM-DD") at the instant `ms` in `timeZone`. */
function dateIn(ms: number, timeZone: string): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Whole days from today in the page's zone to the date: 0 on the day itself, negative after. */
export function daysUntil(date: string, timeZone: string, now = Date.now()): number {
  const day = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  return Math.round((day(date.trim()) - day(dateIn(now, timeZone || "UTC"))) / DAY_MS);
}

/** "4d left", "today", "closed 13d ago": whole days only, since the page gave no time. */
export function dateCountdown(
  date: string,
  timeZone: string,
  t: Translate,
  now = Date.now(),
): { text: string; past: boolean; urgent: boolean; days: number } {
  const days = daysUntil(date, timeZone, now);
  const span = (d: number) => t("desk.time.spanDay", { d });
  return {
    text:
      days === 0
        ? t("desk.time.today")
        : days > 0
          ? t("desk.time.left", { span: span(days) })
          : t("desk.time.closed", { span: span(-days) }),
    past: days < 0,
    urgent: days >= 0 && days < 3,
    days,
  };
}

/** A fact's due fields, as the screen and the actions carry them. */
export interface DueFields {
  dueAt: string | null;
  dueLocal?: string | null | undefined;
  dueTimeZone: string | null;
}

/** Time left for a fact: days for a date-only deadline, else days, hours and minutes. */
export function factCountdown(
  fact: DueFields & { dueAt: string },
  t: Translate,
  now = Date.now(),
): { text: string; past: boolean; urgent: boolean; dateOnly: boolean } {
  if (isDateOnly(fact.dueLocal)) {
    const c = dateCountdown(fact.dueLocal, fact.dueTimeZone ?? "UTC", t, now);
    return { text: c.text, past: c.past, urgent: c.urgent, dateOnly: true };
  }
  const c = countdown(fact.dueAt, t, now);
  return { text: c.text, past: c.past, urgent: c.urgent, dateOnly: false };
}

/** Still ahead (or, for a date-only deadline, on its day in the page's zone). */
export function isAhead(fact: DueFields & { dueAt: string }, now = Date.now()): boolean {
  return isDateOnly(fact.dueLocal)
    ? daysUntil(fact.dueLocal, fact.dueTimeZone ?? "UTC", now) >= 0
    : new Date(fact.dueAt).getTime() >= now;
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
  /**
   * UTC instant (ISO) the app computed from the page's wall-clock time, or for
   * a date-only deadline the page's date ("2026-10-27") with no time.
   */
  dueAt: string;
  /** "2026-11-10 07:59 UTC"; for a date-only deadline "2026-10-27, no time given". */
  utc: string;
  /** The deadline in the person's own zone and language; a date-only deadline gives the page's date. */
  yourTime: string;
  /** The deadline in the zone the page states, or null when the page gave none. */
  pageTime: string | null;
  /** "1d 2h left" / "closed 3h 05m ago" / "4d left" (date only), exactly as the screen shows it. */
  timeLeft: string;
  past: boolean;
  /** Whole minutes to the deadline; negative once it has passed. Null for a date-only deadline. */
  minutesLeft: number | null;
  /** The page gave a date and no time: the app shows no time of day for it. */
  dateOnly: boolean;
  /** Date-only deadlines: whole days from today in the page's zone (0 on the day). Else null. */
  daysLeft: number | null;
}

export function deadlineClock(
  dueAt: string,
  opts: {
    t: Translate;
    locale: string;
    viewerTimeZone: string;
    pageTimeZone?: string | null;
    /** As saved: "YYYY-MM-DD" means the page gave no time. */
    dueLocal?: string | null;
    now?: number;
  },
): DeadlineClock {
  const now = opts.now ?? Date.now();
  if (isDateOnly(opts.dueLocal)) {
    const date = opts.dueLocal.trim();
    const c = dateCountdown(date, opts.pageTimeZone ?? "UTC", opts.t, now);
    const text = dateOnlyText(date, opts.t, opts.locale);
    return {
      dueAt: date,
      utc: `${date}, no time given`,
      yourTime: text,
      pageTime: text,
      timeLeft: c.text,
      past: c.past,
      minutesLeft: null,
      dateOnly: true,
      daysLeft: c.days,
    };
  }
  const c = countdown(dueAt, opts.t, now);
  return {
    dueAt: new Date(dueAt).toISOString(),
    utc: utcText(dueAt),
    yourTime: formatInZone(dueAt, opts.viewerTimeZone, opts.locale),
    pageTime: opts.pageTimeZone ? formatInZone(dueAt, opts.pageTimeZone, opts.locale) : null,
    timeLeft: c.text,
    past: c.past,
    minutesLeft: c.minutes,
    dateOnly: false,
    daysLeft: null,
  };
}

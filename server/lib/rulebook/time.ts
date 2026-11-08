/**
 * Wall-clock time in an IANA zone -> UTC, computed with Intl (no LLM math).
 * "November 9, 2026, 11:59 PM PT" is saved as
 * { local: "2026-11-09T23:59", timeZone: "America/Los_Angeles" } and this
 * returns "2026-11-10T07:59:00.000Z".
 */

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** Offset (minutes) of `timeZone` from UTC at the UTC instant `ms`. */
function offsetMinutes(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - ms) / 60_000);
}

export function zonedLocalToUtc(local: string, timeZone: string): string {
  const m = LOCAL_RE.exec(local.trim());
  if (!m) throw new Error(`"${local}" is not YYYY-MM-DDTHH:mm`);
  if (!isValidTimeZone(timeZone))
    throw new Error(`"${timeZone}" is not an IANA time zone`);
  const [y, mo, d, h, mi, s] = m.slice(1).map((v) => Number(v ?? 0));
  const wall = Date.UTC(y!, mo! - 1, d!, h!, mi!, s ?? 0);
  // Two passes settle DST edges.
  let guess = wall - offsetMinutes(wall, timeZone) * 60_000;
  guess = wall - offsetMinutes(guess, timeZone) * 60_000;
  return new Date(guess).toISOString();
}

/** Common abbreviations the agent may meet in rule pages. */
export const ZONE_ALIASES: Record<string, string> = {
  PT: "America/Los_Angeles",
  PST: "America/Los_Angeles",
  PDT: "America/Los_Angeles",
  MT: "America/Denver",
  MST: "America/Denver",
  MDT: "America/Denver",
  CT: "America/Chicago",
  CST: "America/Chicago",
  CDT: "America/Chicago",
  HST: "Pacific/Honolulu",
  AKST: "America/Anchorage",
  AKDT: "America/Anchorage",
  AEST: "Australia/Sydney",
  AEDT: "Australia/Sydney",
  SGT: "Asia/Singapore",
  HKT: "Asia/Hong_Kong",
  EET: "Europe/Athens",
  EEST: "Europe/Athens",
  WET: "Europe/Lisbon",
  BRT: "America/Sao_Paulo",
  ET: "America/New_York",
  EST: "America/New_York",
  EDT: "America/New_York",
  UTC: "UTC",
  GMT: "UTC",
  KST: "Asia/Seoul",
  JST: "Asia/Tokyo",
  CET: "Europe/Paris",
  CEST: "Europe/Paris",
  BST: "Europe/London",
  IST: "Asia/Kolkata",
  AOE: "Etc/GMT+12",
};

export function resolveTimeZone(input: string): string | null {
  const trimmed = input.trim();
  const alias = ZONE_ALIASES[trimmed.toUpperCase()];
  if (alias) return alias;
  // Bare abbreviations outside the alias table are ambiguous (ICU maps "AST"
  // to Anchorage, "CST" to Chicago), so only IANA names are accepted.
  return trimmed.includes("/") && isValidTimeZone(trimmed) ? trimmed : null;
}

const MONTHS = [
  ["january", "jan"],
  ["february", "feb"],
  ["march", "mar"],
  ["april", "apr"],
  ["may"],
  ["june", "jun"],
  ["july", "jul"],
  ["august", "aug"],
  ["september", "sept", "sep"],
  ["october", "oct"],
  ["november", "nov"],
  ["december", "dec"],
];

/**
 * Does the quote actually state this date (and the hour, when the quote has
 * any clock time)? Guards against a verified quote paired with a misread date.
 */
export function isDateOnly(dueLocal: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dueLocal.trim());
}

/** UTC instant for a due value; a date with no time counts from the start of that day. */
export function dueToUtc(dueLocal: string, timeZone: string): string {
  return zonedLocalToUtc(isDateOnly(dueLocal) ? `${dueLocal.trim()}T00:00` : dueLocal, timeZone);
}

const DAY_MS = 86_400_000;

/**
 * The year a month/day with no year most likely means on a page captured at
 * `capturedAt`: the one that lands from 3 months before to 9 months after the
 * capture (rule pages mostly look ahead). One year fits that 365-day window.
 */
export function yearForUndatedDay(month: number, day: number, capturedAt: string): number | null {
  const at = Date.parse(capturedAt);
  if (!Number.isFinite(at)) return null;
  const year = new Date(at).getUTCFullYear();
  for (const y of [year - 1, year, year + 1]) {
    const diff = (Date.UTC(y, month - 1, day) - at) / DAY_MS;
    if (diff >= -90 && diff < 275) return y;
  }
  return null;
}

export function dateInQuote(
  dueLocal: string,
  quote: string,
  opts: { capturedAt?: string | null | undefined } = {},
): { ok: boolean; reason?: string } {
  const dateOnly = isDateOnly(dueLocal);
  const m = LOCAL_RE.exec(dateOnly ? `${dueLocal.trim()}T00:00` : dueLocal.trim());
  if (!m) return { ok: false, reason: "dueLocal is not YYYY-MM-DDTHH:mm" };
  const [y, mo, d, h, mi] = m.slice(1, 6).map((v) => Number(v));
  const q = quote
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ");
  const names = MONTHS[mo! - 1] ?? [];
  const monthName = names.some((n) => new RegExp(`\\b${n}\\b\\.?`).test(q));
  const day = new RegExp(`(^|[^\\d])0?${d}(st|nd|rd|th)?(?!\\d)`).test(q);
  const pad = (n: number) => String(n).padStart(2, "0");
  const numeric = [
    `${y}-${pad(mo!)}-${pad(d!)}`,
    `${y}.${pad(mo!)}.${pad(d!)}`,
    `${y}/${pad(mo!)}/${pad(d!)}`,
    `${mo}/${d}/`,
    `${pad(mo!)}/${pad(d!)}/`,
    `${d}/${mo}/`,
    `${d}.${mo}.`,
    `${mo}월 ${d}일`,
    `${mo}월${d}일`,
  ].some((pattern) => q.includes(pattern));
  if (!numeric && !(monthName && day))
    return { ok: false, reason: `The quote does not state ${dueLocal.slice(0, 10)}.` };
  const year = yearCheck(y!, mo!, d!, q, names, opts.capturedAt ?? null);
  if (!year.ok) return year;
  const hasClock = /\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*(am|pm|a\.m\.|p\.m\.)|\bnoon\b|\bmidnight\b/.test(q);
  if (dateOnly) return { ok: true };
  if (!hasClock)
    return {
      ok: false,
      reason: `The quote states no time. Send dueLocal as the date only ("${dueLocal.slice(0, 10)}").`,
    };
  const h12 = h! % 12 === 0 ? 12 : h! % 12;
  const ampm = h! < 12 ? "a" : "p";
  const clock = [
    new RegExp(`\\b${h12}(:${pad(mi!)})?\\s*${ampm}\\.?m\\b`),
    // 24-hour forms only when no am/pm follows ("11:59 PM" is not 11:59).
    new RegExp(`\\b${pad(h!)}:${pad(mi!)}\\b(?!\\s*(am|pm|a\\.m|p\\.m))`),
    new RegExp(`\\b${h}:${pad(mi!)}\\b(?!\\s*(am|pm|a\\.m|p\\.m))`),
  ].some((re) => re.test(q));
  const word =
    (h === 12 && mi === 0 && /\bnoon\b/.test(q)) ||
    (((h === 0 && mi === 0) || (h === 23 && mi === 59)) && /\bmidnight\b/.test(q));
  return clock || word
    ? { ok: true }
    : { ok: false, reason: `The quote gives a time, but not ${dueLocal.slice(11, 16)}.` };
}

/**
 * The year must be the one the quote gives for that day. When the quote gives
 * no year at all, it must be the year the page meant when it was captured.
 * Ranges like "December 16 – January 29, 2027" give the first day no year of
 * its own, so any year the quote names, or the one before it, is accepted.
 */
function yearCheck(
  y: number,
  mo: number,
  d: number,
  q: string,
  names: string[],
  capturedAt: string | null,
): { ok: boolean; reason?: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = `${y}-${pad(mo)}-${pad(d)}`;
  const month = `(?:${names.join("|")})\\.?`;
  const dayRe = `0?${d}(?:st|nd|rd|th)?`;
  const attached = [
    new RegExp(`\\b${month}\\s+${dayRe},?\\s+((?:19|20)\\d{2})\\b`, "g"),
    new RegExp(`(?:^|[^\\d])${dayRe}\\s+${month},?\\s+((?:19|20)\\d{2})\\b`, "g"),
    new RegExp(`((?:19|20)\\d{2})\\s*년\\s*0?${mo}\\s*월\\s*0?${d}\\s*일`, "g"),
    new RegExp(`((?:19|20)\\d{2})[-./]0?${mo}[-./]0?${d}(?!\\d)`, "g"),
    new RegExp(`(?:^|[^\\d])0?${mo}/0?${d}/((?:19|20)\\d{2})\\b`, "g"),
  ].flatMap((re) => [...q.matchAll(re)].map((m) => Number(m[1])));
  if (attached.length)
    return attached.includes(y)
      ? { ok: true }
      : { ok: false, reason: `The quote gives that day as ${attached[0]}, not ${y}.` };
  // Only numbers near the due year read as years ("$2000 prize" is not one).
  const named = [...q.matchAll(/(?:^|[^\d$€£,.])((?:19|20)\d{2})(?!\d)/g)]
    .map((m) => Number(m[1]))
    .filter((n) => Math.abs(n - y) <= 3);
  if (named.length)
    return named.some((n) => n === y || n - 1 === y)
      ? { ok: true }
      : { ok: false, reason: `The quote names ${[...new Set(named)].join(", ")}, not ${y}.` };
  if (!capturedAt) return { ok: true };
  const expected = yearForUndatedDay(mo, d, capturedAt);
  if (expected === null || expected === y) return { ok: true };
  return {
    ok: false,
    reason: `The quote gives no year, and on a page captured ${capturedAt.slice(0, 10)} that day means ${expected}-${pad(mo)}-${pad(d)}, not ${ymd}. Quote a sentence that states the year if the page says otherwise.`,
  };
}

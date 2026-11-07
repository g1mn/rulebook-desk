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
export function dateInQuote(dueLocal: string, quote: string): { ok: boolean; reason?: string } {
  const m = LOCAL_RE.exec(dueLocal.trim());
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
  const hasClock = /\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*(am|pm|a\.m\.|p\.m\.)|\bnoon\b|\bmidnight\b/.test(q);
  if (!hasClock) return { ok: true };
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

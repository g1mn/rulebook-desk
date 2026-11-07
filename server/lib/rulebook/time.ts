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
  CT: "America/Chicago",
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
  return isValidTimeZone(trimmed) ? trimmed : null;
}

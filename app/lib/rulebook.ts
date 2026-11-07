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

export const KIND_LABEL: Record<FactKind, string> = {
  deadline: "Deadlines",
  submission: "What to submit",
  requirement: "Requirements",
  eligibility: "Eligibility",
  judging: "Judging",
  prize: "Prizes",
  other: "Other",
};

export const KIND_SINGULAR: Record<FactKind, string> = {
  deadline: "Deadline",
  submission: "Submission item",
  requirement: "Requirement",
  eligibility: "Eligibility",
  judging: "Judging",
  prize: "Prize",
  other: "Other",
};

export function userTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function formatInZone(iso: string, timeZone: string): string {
  const text = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
  // "GMT+9" says little; name the city instead ("Seoul time").
  if (timeZone === "Etc/GMT+12") return text.replace(/GMT-12/, "AoE (UTC−12)");
  if (/GMT[+-]\d/.test(text) && timeZone.includes("/") && !timeZone.startsWith("Etc/")) {
    const city = timeZone.split("/").pop()!.replace(/_/g, " ");
    return text.replace(/GMT[+-][\d:]+/, `${city} time`);
  }
  return text;
}

export function shortDate(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", {
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

/** "2d 14h left", "3h 05m left", "closed 4d ago". */
export function countdown(iso: string, now = Date.now()): {
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
    d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
  return {
    text: past ? `closed ${span} ago` : `${span} left`,
    past,
    urgent: !past && diff < 3 * 86_400_000,
  };
}

export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  const diff = now - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function editorLabel(by: string): string {
  if (by === "person") return "You";
  if (by === "automation") return "Daily check";
  return "Agent";
}

export function formatWayback(ts: string | null): string | null {
  if (!ts) return null;
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(ts);
  if (!m) return ts;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)));
}

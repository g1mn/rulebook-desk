/**
 * Deadline clocks for the actions and the agent's context. The strings come
 * from shared/deadline-clock.ts and the screen's own time catalog, so what the
 * agent quotes is exactly what the person sees on screen ("1d 2h left",
 * "1일 2시간 남음"). The agent is told never to do this arithmetic itself.
 */
import { readAppState } from "@agent-native/core/application-state";
import { getRequestTimezone } from "@agent-native/core/server";
import { accessFilter } from "@agent-native/core/sharing";
import { and, asc, eq, gte, inArray, isNotNull, ne } from "drizzle-orm";

import deDE from "../../../app/i18n/desk/de-DE.js";
import enUS, { type DeskMessages } from "../../../app/i18n/desk/en-US.js";
import esES from "../../../app/i18n/desk/es-ES.js";
import frFR from "../../../app/i18n/desk/fr-FR.js";
import jaJP from "../../../app/i18n/desk/ja-JP.js";
import koKR from "../../../app/i18n/desk/ko-KR.js";
import ptBR from "../../../app/i18n/desk/pt-BR.js";
import viVN from "../../../app/i18n/desk/vi-VN.js";
import zhCN from "../../../app/i18n/desk/zh-CN.js";
import zhTW from "../../../app/i18n/desk/zh-TW.js";
import {
  deadlineClock,
  formatInZone,
  utcText,
  type DeadlineClock,
  type Translate,
} from "../../../shared/deadline-clock.js";
import { SOURCE_LOCALE, type AppLocale } from "../../../shared/locales.js";
import { getDb, schema } from "../../db/index.js";
import { acceptLanguageOf, headerOf, replyLocaleFor } from "../agent-language.js";
import { isValidTimeZone } from "./time.js";

const TIME_TEXT: Record<AppLocale, DeskMessages["time"]> = {
  "en-US": enUS.time,
  "ko-KR": koKR.time,
  "ja-JP": jaJP.time,
  "zh-CN": zhCN.time,
  "zh-TW": zhTW.time,
  "es-ES": esES.time,
  "fr-FR": frFR.time,
  "de-DE": deDE.time,
  "pt-BR": ptBR.time,
  "vi-VN": viVN.time,
};

/** The screen's desk.time.* strings for one language, filled like i18next does. */
export function deskTimeT(locale: AppLocale): Translate {
  const table = TIME_TEXT[locale] ?? TIME_TEXT[SOURCE_LOCALE];
  return (key, options = {}) => {
    const name = key.replace(/^desk\.time\./, "") as keyof DeskMessages["time"];
    const template = table[name] ?? TIME_TEXT[SOURCE_LOCALE][name] ?? key;
    return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(options[k] ?? ""));
  };
}

/** Whose clock: the person's language and browser time zone (UTC when unknown). */
export interface ClockViewer {
  locale: AppLocale;
  timeZone: string;
}

export function viewerZone(timeZone: string | null | undefined): string {
  const zone = timeZone?.trim();
  return zone && isValidTimeZone(zone) ? zone : "UTC";
}

/** The browser zone the screen last reported (navigation app state). Chat
 *  requests carry no x-user-timezone header, so without this the agent's
 *  "your time" fell back to UTC. */
async function screenTimeZone(): Promise<string | undefined> {
  try {
    const nav = (await readAppState("navigation")) as { timeZone?: unknown } | null;
    return typeof nav?.timeZone === "string" ? nav.timeZone : undefined;
  } catch {
    return undefined;
  }
}

/** Language from the person's setting or screen; zone from the browser header,
 *  else from the screen's navigation state. Never throws. */
export async function resolveClockViewer(
  owner: string | undefined,
  overrides: {
    locale?: AppLocale | undefined;
    timeZone?: string | null | undefined;
    acceptLanguage?: string | null | undefined;
  } = {},
): Promise<ClockViewer> {
  const locale =
    overrides.locale ??
    (await replyLocaleFor(owner, overrides.acceptLanguage ?? null).catch(() => SOURCE_LOCALE));
  let header: string | undefined;
  try {
    header = getRequestTimezone();
  } catch {
    header = undefined;
  }
  const zone = overrides.timeZone?.trim() || header?.trim() || (await screenTimeZone());
  return { locale, timeZone: viewerZone(zone) };
}

export function clockFor(
  fact: { dueAt: string | null; dueLocal: string | null; dueTimeZone: string | null },
  viewer: ClockViewer,
  now = Date.now(),
): DeadlineClock | null {
  if (!fact.dueAt) return null;
  return deadlineClock(fact.dueAt, {
    t: deskTimeT(viewer.locale),
    locale: viewer.locale,
    viewerTimeZone: viewer.timeZone,
    pageTimeZone: fact.dueTimeZone,
    // "YYYY-MM-DD": the page gave no time, so the clock gives none either.
    dueLocal: fact.dueLocal,
    now,
  });
}

/** "Now" in UTC and in the person's zone, computed in code. */
export function nowClock(viewer: ClockViewer, now = Date.now()) {
  const iso = new Date(now).toISOString();
  return {
    utc: utcText(iso),
    yourTime: formatInZone(iso, viewer.timeZone, viewer.locale),
    timeZone: viewer.timeZone,
  };
}

export interface ClockedDeadline {
  factId: string;
  rulebookId: string;
  rulebookName: string;
  label: string;
  kind: string;
  status: string;
  clock: DeadlineClock;
}

const DAY_MS = 86_400_000;

/**
 * Dated facts the person can see, soonest first: the ones still ahead plus
 * those closed in the last day (the screen's timeline window). Rejected facts
 * are left out.
 */
export async function upcomingDeadlines(
  viewer: ClockViewer,
  opts: {
    rulebookId?: string | undefined;
    factId?: string | undefined;
    now?: number | undefined;
    limit?: number | undefined;
  } = {},
): Promise<ClockedDeadline[]> {
  const now = opts.now ?? Date.now();
  const db = getDb();
  const { facts, rulebooks, rulebookShares } = schema;
  const books = await db
    .select({ id: rulebooks.id, name: rulebooks.name })
    .from(rulebooks)
    .where(
      opts.rulebookId
        ? and(eq(rulebooks.id, opts.rulebookId), accessFilter(rulebooks, rulebookShares))
        : accessFilter(rulebooks, rulebookShares),
    )
    .limit(100);
  if (!books.length) return [];
  const names = new Map(books.map((b) => [b.id, b.name]));
  const rows = await db
    .select({
      id: facts.id,
      rulebookId: facts.rulebookId,
      label: facts.label,
      kind: facts.kind,
      status: facts.status,
      dueAt: facts.dueAt,
      dueLocal: facts.dueLocal,
      dueTimeZone: facts.dueTimeZone,
    })
    .from(facts)
    .where(
      and(
        inArray(
          facts.rulebookId,
          books.map((b) => b.id),
        ),
        isNotNull(facts.dueAt),
        ne(facts.status, "rejected"),
        opts.factId
          ? eq(facts.id, opts.factId)
          : gte(facts.dueAt, new Date(now - DAY_MS).toISOString()),
      ),
    )
    .orderBy(asc(facts.dueAt))
    .limit(opts.limit ?? 30);
  return rows.map((r) => ({
    factId: r.id,
    rulebookId: r.rulebookId,
    rulebookName: names.get(r.rulebookId) ?? "",
    label: r.label,
    kind: r.kind,
    status: r.status,
    clock: clockFor(r, viewer, now)!,
  }));
}

export const CLOCK_RULE =
  'Quote these strings exactly. Do no date or time arithmetic yourself: no "in about N hours", no "today" or "tomorrow" you worked out, no zone conversion. A deadline marked "date only" has no time on the page: give its date, never a time of day or an hour count for it. For a fresh value or a deadline not listed here, call deadline-clock.';

/** The <deadline-clock> block added to the agent's context on every request. */
export function deadlineClockBlock(input: {
  viewer: ClockViewer;
  now?: number;
  rulebook?: { name: string } | null;
  deadlines: ClockedDeadline[];
}): string {
  const now = nowClock(input.viewer, input.now);
  const lines = [
    "<deadline-clock>",
    `Computed in code. Now: ${now.utc} (the person's time: ${now.yourTime}, zone ${now.timeZone}).`,
  ];
  if (input.deadlines.length) {
    lines.push(
      input.rulebook
        ? `Deadlines in the open rulebook "${input.rulebook.name}", soonest first:`
        : "Next deadlines across tracked rulebooks, soonest first:",
    );
    for (const d of input.deadlines) {
      const c = d.clock;
      const where = input.rulebook ? "" : ` [${d.rulebookName}]`;
      if (c.dateOnly) {
        // No time on the page: no "your time", no UTC instant.
        lines.push(
          `- ${d.label}${where}: ${c.timeLeft} | date only, page says ${c.pageTime} (factId ${d.factId}, ${d.status})`,
        );
        continue;
      }
      const page = c.pageTime ? ` | page says ${c.pageTime}` : "";
      lines.push(
        `- ${d.label}${where}: ${c.timeLeft} | your time ${c.yourTime}${page} | ${c.utc} (factId ${d.factId}, ${d.status})`,
      );
    }
  }
  lines.push(CLOCK_RULE, "</deadline-clock>");
  return lines.join("\n");
}

/** extraContext piece: the clock block for what is on screen. Never throws. */
export async function deadlineClockContext(
  event: unknown,
  owner: string,
  now = Date.now(),
): Promise<string> {
  try {
    const viewer = await resolveClockViewer(owner, {
      timeZone: headerOf(event, "x-user-timezone"),
      acceptLanguage: acceptLanguageOf(event),
    });
    const navigation = (await readAppState("navigation").catch(() => null)) as {
      rulebookId?: string;
    } | null;
    const rulebookId = navigation?.rulebookId;
    const deadlines = await upcomingDeadlines(viewer, { rulebookId, now, limit: 8 }).catch(
      () => [],
    );
    const rulebook = rulebookId && deadlines[0] ? { name: deadlines[0].rulebookName } : null;
    return deadlineClockBlock({ viewer, now, rulebook, deadlines });
  } catch {
    return "";
  }
}

/** A fact as returned by an action, with its code-computed clock when it has a deadline. */
export function withClock<
  T extends { dueAt: string | null; dueLocal: string | null; dueTimeZone: string | null },
>(
  fact: T,
  viewer: ClockViewer,
  now = Date.now(),
): T & { clock: DeadlineClock | null } {
  return { ...fact, clock: clockFor(fact, viewer, now) };
}

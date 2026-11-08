import { readAppState } from "@agent-native/core/application-state";
import { normalizeLocaleCode } from "@agent-native/core/localization/shared";
import { getUserSetting } from "@agent-native/core/settings";

import {
  AGENT_LANGUAGE_NAMES,
  APP_LOCALES,
  SOURCE_LOCALE,
  type AppLocale,
} from "../../shared/locales.js";

function toAppLocale(value: unknown): AppLocale | null {
  if (typeof value !== "string" || !value || value === "system") return null;
  return normalizeLocaleCode(value, APP_LOCALES) as AppLocale | null;
}

/**
 * Which language the person reads the app in. An explicit choice (header menu
 * or Settings › Preferences) wins; with "system" it is the language the
 * browser resolved, then the request's Accept-Language, then English.
 */
export function pickReplyLocale(input: {
  setting?: unknown;
  screen?: unknown;
  acceptLanguage?: string | null;
}): AppLocale {
  const chosen = toAppLocale(input.setting);
  if (chosen) return chosen;
  const shown = toAppLocale(input.screen);
  if (shown) return shown;
  for (const part of (input.acceptLanguage ?? "").split(",")) {
    const match = toAppLocale(part.split(";")[0]?.trim());
    if (match) return match;
  }
  return SOURCE_LOCALE;
}

/**
 * Added to the system prompt when the person reads the app in a language
 * other than English. Quotes stay verbatim: the quote check in save-facts and
 * update-fact compares them with the fetched page, so a translated quote would
 * be rejected anyway. Only the agent's own words follow the screen language.
 */
export function replyLanguageInstruction(locale: AppLocale): string {
  if (locale === SOURCE_LOCALE) return "";
  const name = AGENT_LANGUAGE_NAMES[locale];
  return `<reply-language>
The person reads this app in ${name}. Write every reply to them in ${name}, and write the label and detail (note) of each fact you save in ${name}.
Never translate a quote. The quote field, and any rule sentence you cite in a reply, stay exactly as written on the page, in the page's own language; put your ${name} explanation next to it.
Action names, ids, URLs, dueLocal, timeZone, kind and status values stay exactly as the actions define them.
</reply-language>`;
}

function acceptLanguageOf(event: unknown): string | null {
  const e = event as {
    req?: { headers?: { get?: (name: string) => string | null } };
    node?: { req?: { headers?: Record<string, string | string[] | undefined> } };
  } | null;
  const fromRequest = e?.req?.headers?.get?.("accept-language");
  if (fromRequest) return fromRequest;
  const raw = e?.node?.req?.headers?.["accept-language"];
  return Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);
}

/** extraContext hook for the agent chat plugin. Never throws. */
export async function agentLanguageContext(event: unknown, owner: string): Promise<string> {
  const [setting, screen] = await Promise.all([
    owner
      ? getUserSetting(owner, "localization").catch(() => null)
      : Promise.resolve(null),
    readAppState("localization").catch(() => null),
  ]);
  const locale = pickReplyLocale({
    setting: setting?.locale,
    screen: screen?.locale,
    acceptLanguage: acceptLanguageOf(event),
  });
  return replyLanguageInstruction(locale);
}

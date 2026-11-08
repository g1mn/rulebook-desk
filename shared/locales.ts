/**
 * The languages Rulebook Desk ships with. English is the source language;
 * every other locale must carry the same message keys (see app/i18n/i18n.test.ts).
 * Shared by the client catalog and the agent's reply-language instruction.
 */
export const APP_LOCALES = ["en-US", "ko-KR", "ja-JP", "zh-CN"] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

export const SOURCE_LOCALE: AppLocale = "en-US";

/** How the agent prompt names each language (English name, then native). */
export const AGENT_LANGUAGE_NAMES: Record<AppLocale, string> = {
  "en-US": "English",
  "ko-KR": "Korean (한국어)",
  "ja-JP": "Japanese (日本語)",
  "zh-CN": "Simplified Chinese (简体中文)",
};

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (APP_LOCALES as readonly string[]).includes(value);
}

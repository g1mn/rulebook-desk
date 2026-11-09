/**
 * The languages Rulebook Desk ships with. English is the source language;
 * every other locale must carry the same message keys (see app/i18n/i18n.test.ts).
 * Shared by the client catalog and the agent's reply-language instruction.
 * The order is the order of the header language menu.
 */
export const APP_LOCALES = [
  "en-US",
  "ko-KR",
  "ja-JP",
  "zh-CN",
  "zh-TW",
  "es-ES",
  "fr-FR",
  "de-DE",
  "pt-BR",
  "vi-VN",
] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

export const SOURCE_LOCALE: AppLocale = "en-US";

/**
 * Name shown in the language menu: each language in its own name. The
 * framework knows every language here except Vietnamese; the menu cuts a name
 * at "(", so Português (Brasil) shows as "Português".
 */
export const APP_LOCALE_METADATA = [
  { code: "en-US", englishName: "English", nativeName: "English", dir: "ltr" },
  { code: "ko-KR", englishName: "Korean", nativeName: "한국어", dir: "ltr" },
  { code: "ja-JP", englishName: "Japanese", nativeName: "日本語", dir: "ltr" },
  { code: "zh-CN", englishName: "Chinese (Simplified)", nativeName: "简体中文", dir: "ltr" },
  { code: "zh-TW", englishName: "Chinese (Traditional)", nativeName: "繁體中文", dir: "ltr" },
  { code: "es-ES", englishName: "Spanish", nativeName: "Español", dir: "ltr" },
  { code: "fr-FR", englishName: "French", nativeName: "Français", dir: "ltr" },
  { code: "de-DE", englishName: "German", nativeName: "Deutsch", dir: "ltr" },
  { code: "pt-BR", englishName: "Portuguese (Brazil)", nativeName: "Português (Brasil)", dir: "ltr" },
  { code: "vi-VN", englishName: "Vietnamese", nativeName: "Tiếng Việt", dir: "ltr" },
] as const satisfies readonly {
  code: AppLocale;
  englishName: string;
  nativeName: string;
  dir: "ltr" | "rtl";
}[];

/** How the agent prompt names each language (English name, then native). */
export const AGENT_LANGUAGE_NAMES: Record<AppLocale, string> = {
  "en-US": "English",
  "ko-KR": "Korean (한국어)",
  "ja-JP": "Japanese (日本語)",
  "zh-CN": "Simplified Chinese (简体中文)",
  "zh-TW": "Traditional Chinese (繁體中文)",
  "es-ES": "Spanish (Español)",
  "fr-FR": "French (Français)",
  "de-DE": "German (Deutsch)",
  "pt-BR": "Brazilian Portuguese (Português do Brasil)",
  "vi-VN": "Vietnamese (Tiếng Việt)",
};

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (APP_LOCALES as readonly string[]).includes(value);
}

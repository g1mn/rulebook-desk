import { createToolkitI18nCatalog } from "@agent-native/toolkit/app/i18n";

import { APP_LOCALE_METADATA, APP_LOCALES, SOURCE_LOCALE } from "../../shared/locales";

import enUS from "./en-US";

// Only the ten languages the desk is fully translated into are offered, in
// the header switcher and in Settings › Preferences alike. The choice is saved
// to the user's `localization` setting (set-localization-preference).
const toolkitCatalog = createToolkitI18nCatalog({
  messages: enUS,
  sourceLocale: SOURCE_LOCALE,
  supportedLocales: APP_LOCALES,
  restrictToCatalogLocales: true,
  locales: APP_LOCALE_METADATA,
  localeLoaders: {
    "ko-KR": () => import("./ko-KR"),
    "ja-JP": () => import("./ja-JP"),
    "zh-CN": () => import("./zh-CN"),
    "zh-TW": () => import("./zh-TW"),
    "es-ES": () => import("./es-ES"),
    "fr-FR": () => import("./fr-FR"),
    "de-DE": () => import("./de-DE"),
    "pt-BR": () => import("./pt-BR"),
  },
});

// The toolkit wires loaders only for the framework's built-in languages (it
// brings its own chat and settings text for those). Vietnamese is not one of
// them, so its app text is loaded here; the framework's own text in chat and
// settings falls back to English.
export const i18nCatalog: typeof toolkitCatalog = {
  ...toolkitCatalog,
  loadMessages: async (locale) =>
    locale === "vi-VN" ? (await import("./vi-VN")).default : toolkitCatalog.loadMessages(locale),
};

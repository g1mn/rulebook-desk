import { createToolkitI18nCatalog } from "@agent-native/toolkit/app/i18n";

import { APP_LOCALES, SOURCE_LOCALE } from "../../shared/locales";

import enUS from "./en-US";

// Only the four languages the desk is fully translated into are offered, in
// the header switcher and in Settings › Preferences alike. The choice is saved
// to the user's `localization` setting (set-localization-preference).
export const i18nCatalog = createToolkitI18nCatalog({
  messages: enUS,
  sourceLocale: SOURCE_LOCALE,
  supportedLocales: APP_LOCALES,
  restrictToCatalogLocales: true,
  localeLoaders: {
    "ko-KR": () => import("./ko-KR"),
    "ja-JP": () => import("./ja-JP"),
    "zh-CN": () => import("./zh-CN"),
  },
});

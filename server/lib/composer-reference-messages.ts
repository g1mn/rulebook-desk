import {
  DEFAULT_LOCALE,
  LOCALIZATION_SETTING_KEY,
  normalizeLocalizationPreference,
} from "@agent-native/core/localization";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { getUserSetting } from "@agent-native/core/settings";

const catalogs = {
  "en-US": () => import("../../app/i18n/en-US.js"),
  "ja-JP": () => import("../../app/i18n/ja-JP.js"),
  "ko-KR": () => import("../../app/i18n/ko-KR.js"),
  "zh-CN": () => import("../../app/i18n/zh-CN.js"),
};

export async function composerReferenceMessages() {
  const email = getRequestUserEmail();
  const preference = normalizeLocalizationPreference(
    email ? await getUserSetting(email, LOCALIZATION_SETTING_KEY) : undefined,
  );
  const locale = preference.locale;
  const load =
    locale && locale in catalogs
      ? catalogs[locale as keyof typeof catalogs]
      : catalogs[DEFAULT_LOCALE as keyof typeof catalogs];
  return (await load()).default.composerSources;
}

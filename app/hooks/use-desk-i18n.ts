import { useLocale, useT } from "@agent-native/core/client/i18n";

import type { Translate } from "@/lib/rulebook";

/** Translate function plus the active locale for Intl date formatting. */
export function useDeskI18n(): { t: Translate; locale: string } {
  const t = useT();
  const { locale } = useLocale();
  return { t, locale };
}

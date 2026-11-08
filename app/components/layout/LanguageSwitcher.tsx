import { useLocale, type LocalePreference } from "@agent-native/core/client/i18n";
import { localeDisplayName } from "@agent-native/core/localization/shared";
import { IconChevronDown, IconLanguage } from "@tabler/icons-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDeskI18n } from "@/hooks/use-desk-i18n";

/**
 * Header language menu. It writes the same `localization` user setting as
 * Settings › Preferences (via the framework's set-localization-preference), so
 * the choice follows the person across devices and reaches the agent prompt.
 */
export function LanguageSwitcher() {
  const { locale, preference, setPreference, supportedLocales, localeMetadata } = useLocale();
  const { t } = useDeskI18n();

  function choose(value: string) {
    setPreference(value as LocalePreference).catch(() =>
      toast.error(t("desk.language.saveFailed")),
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-language-switcher=""
          aria-label={`${t("desk.language.label")}: ${localeDisplayName(locale, localeMetadata)}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <IconLanguage className="size-4 text-muted-foreground" />
          <span>{localeDisplayName(locale, localeMetadata)}</span>
          <IconChevronDown className="size-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {t("desk.language.label")}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={preference} onValueChange={choose}>
          {supportedLocales.map((code) => (
            <DropdownMenuRadioItem key={code} value={code} lang={code}>
              {localeDisplayName(code, localeMetadata)}
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuRadioItem value="system">{t("desk.language.system")}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

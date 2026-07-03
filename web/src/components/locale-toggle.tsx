"use client";

/**
 * हि / EN language toggle (RoleShell top bar + login page).
 * Writes the plain tb_locale cookie, then router.refresh() so the server
 * re-renders every server component in the new locale and the fresh locale
 * prop flows back into LocaleProvider — client and server always agree.
 */
import { useRouter } from "next/navigation";
import { useLocale, useMessages } from "@/lib/i18n/locale-context";
import { LOCALES, setLocaleCookie, type Locale } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";

const LOCALE_SHORT: Record<Locale, string> = { hi: "हिं", en: "EN" };

export function LocaleToggle() {
  const router = useRouter();
  const locale = useLocale();
  const m = useMessages();

  const select = (next: Locale) => {
    if (next === locale) return;
    setLocaleCookie(next);
    router.refresh();
  };

  return (
    <div
      role="group"
      aria-label={m.UI.languageToggle}
      data-testid="locale-toggle"
      className="flex shrink-0 items-center rounded-lg border p-0.5"
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={locale === l}
          data-testid={`locale-${l}`}
          className={cn(
            "min-h-8 rounded-md px-2 text-xs font-medium transition-colors",
            locale === l
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => select(l)}
        >
          {LOCALE_SHORT[l]}
        </button>
      ))}
    </div>
  );
}

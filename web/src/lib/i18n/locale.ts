/**
 * Locale primitives — shared by server (cookies()) and client (context/toggle).
 *
 * The product is Hindi-first (org config `locale.default = 'hi'`): no cookie ⇒
 * Hindi. The cookie is deliberately NOT httpOnly — it is not a secret, and the
 * client toggle writes it directly before router.refresh().
 */

export const LOCALES = ["hi", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "hi";
export const LOCALE_COOKIE = "tb_locale";
/** 1 year — a sticky preference, not a session value. */
export const LOCALE_COOKIE_MAX_AGE = 31_536_000;

export function parseLocale(value: unknown): Locale {
  return value === "en" || value === "hi" ? value : DEFAULT_LOCALE;
}

/** document.cookie payload used by the client-side language toggle. */
export function localeCookieString(locale: Locale): string {
  return `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`;
}

/** Persist the preference (client-side only; plain non-httpOnly cookie). */
export function setLocaleCookie(locale: Locale): void {
  document.cookie = localeCookieString(locale);
}

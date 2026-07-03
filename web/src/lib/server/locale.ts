/**
 * Server-side locale resolution — mirrors the auth-cookie pattern in
 * ./backend.ts (cookies() is the only source; no headers/Accept-Language
 * guessing, the product is Hindi-first by default).
 */
import { cookies } from 'next/headers';
import { LOCALE_COOKIE, parseLocale, type Locale } from '@/lib/i18n/locale';

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return parseLocale(store.get(LOCALE_COOKIE)?.value);
}

'use client';

/**
 * Client-side locale context. The root layout reads the tb_locale cookie
 * server-side and passes it down, so the value here ALWAYS equals what the
 * server rendered with — no hydration mismatch by construction.
 */
import { createContext, useContext } from 'react';
import { DEFAULT_LOCALE, type Locale } from './locale';
import { getMessages, type Messages } from './messages';

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** The message catalog for the active locale. */
export function useMessages(): Messages {
  return getMessages(useContext(LocaleContext));
}

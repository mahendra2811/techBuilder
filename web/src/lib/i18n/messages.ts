/**
 * Locale → message-catalog accessor + envelope-error helpers.
 *
 * - Server components:  `const m = getMessages(await getLocale())`
 *   (getLocale from '@/lib/server/locale').
 * - Client components:  `const m = useMessages()`
 *   (from '@/lib/i18n/locale-context', hydrated with the server's locale so
 *   the first client render always matches the SSR HTML).
 */
import type { ErrorCode } from '@techbuilder/contracts';
import type { Locale } from './locale';
import { en, type Messages } from './messages.en';
import { hi } from './messages.hi';

export type { Messages };

const CATALOGS: Record<Locale, Messages> = { en, hi };

export function getMessages(locale: Locale): Messages {
  return CATALOGS[locale];
}

/** Auth-flow API error → user message (login / change-password). */
export function authErrorMessage(m: Messages, code?: ErrorCode): string {
  const map: Partial<Record<ErrorCode, string>> & { DEFAULT: string } = m.AUTH_MESSAGES;
  return (code && map[code]) || map.DEFAULT;
}

/** General API error → user message (field-entry + owner screens). */
export function apiErrorMessage(m: Messages, code?: ErrorCode): string {
  const map: Partial<Record<ErrorCode, string>> & { DEFAULT: string } = m.API_MESSAGES;
  return (code && map[code]) || map.DEFAULT;
}

/**
 * Literal progress text submitted by the “Nothing to report” quick action.
 * Locale-INDEPENDENT on purpose: it is stored data (a canonical marker), not
 * UI copy — the button label itself is localized (ENTRY_UI.nothingToReport).
 */
export const NOTHING_TO_REPORT_TEXT = 'Nothing to report';

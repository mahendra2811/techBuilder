/**
 * WhatsApp daily digest (pilot-critical) — a PURE text builder so it can be
 * verified node-side and reused by the copy + wa.me share buttons. Composes
 * only from data the dashboard screen already fetched; stays under ~15 lines.
 */
import type { CompletenessState, Paise } from '@techbuilder/contracts';
import type { Messages } from './i18n/messages';
import { formatPaise } from './money';

export interface DigestSiteLine {
  code: string;
  name: string;
  /** Attendance rows marked today at this site. */
  markedCount: number;
  /** Today's completeness state (undefined = off day / no data). */
  state: CompletenessState | undefined;
  /** Today's expense total at this site (paise). */
  expensePaise: Paise;
  /** Today's fuel total for vehicles assigned to this site (paise). */
  fuelPaise: Paise;
}

export interface DigestInput {
  orgName: string;
  /** Human date label, e.g. "03 Jul 2026". */
  dateLabel: string;
  sites: DigestSiteLine[];
  headcountToday: number;
  spendTodayPaise: Paise;
}

/** Plain-text digest of TODAY: org header, one line per site, org totals.
 * Strings come from the ACTIVE locale's catalog (the owner shares it as-is). */
export function buildTodayDigest(input: DigestInput, m: Messages): string {
  const lines: string[] = [
    `${input.orgName} — ${input.dateLabel}`,
    m.OWNER_UI.digestSitesHeading,
  ];
  for (const s of input.sites) {
    const state = s.state ? m.COMPLETENESS_STATE_LABELS[s.state] : m.OWNER_UI.completenessNoData;
    lines.push(
      `• ${s.code} ${s.name}: ${s.markedCount} ${m.OWNER_UI.digestMarked} · ${state} · ` +
        `${m.OWNER_UI.digestExpense} ${formatPaise(s.expensePaise)} · ${m.OWNER_UI.digestFuel} ${formatPaise(s.fuelPaise)}`,
    );
  }
  lines.push(
    `${m.OWNER_UI.digestTotalSpend} ${formatPaise(input.spendTodayPaise)}`,
    `${m.OWNER_UI.digestHeadcount} ${input.headcountToday}`,
    m.OWNER_UI.digestFooter,
  );
  return lines.join('\n');
}

/** wa.me share URL for a digest (opens WhatsApp with the text pre-filled). */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

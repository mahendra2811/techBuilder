/**
 * WhatsApp daily digest (pilot-critical) — a PURE text builder so it can be
 * verified node-side and reused by the copy + wa.me share buttons. Composes
 * only from data the dashboard screen already fetched; stays under ~15 lines.
 */
import type { CompletenessState, Paise } from '@techbuilder/contracts';
import { COMPLETENESS_STATE_LABELS, OWNER_UI } from './messages';
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

/** Plain-text digest of TODAY: org header, one line per site, org totals. */
export function buildTodayDigest(input: DigestInput): string {
  const lines: string[] = [
    `${input.orgName} — ${input.dateLabel}`,
    OWNER_UI.digestSitesHeading,
  ];
  for (const s of input.sites) {
    const state = s.state ? COMPLETENESS_STATE_LABELS[s.state] : OWNER_UI.completenessNoData;
    lines.push(
      `• ${s.code} ${s.name}: ${s.markedCount} ${OWNER_UI.digestMarked} · ${state} · ` +
        `${OWNER_UI.digestExpense} ${formatPaise(s.expensePaise)} · ${OWNER_UI.digestFuel} ${formatPaise(s.fuelPaise)}`,
    );
  }
  lines.push(
    `${OWNER_UI.digestTotalSpend} ${formatPaise(input.spendTodayPaise)}`,
    `${OWNER_UI.digestHeadcount} ${input.headcountToday}`,
    OWNER_UI.digestFooter,
  );
  return lines.join('\n');
}

/** wa.me share URL for a digest (opens WhatsApp with the text pre-filled). */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

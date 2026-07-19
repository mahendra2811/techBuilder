import type { MaterialTxnStatus } from '@techbuilder/contracts';

export type StatusTone = 'success' | 'warning' | 'error';

/** Diesel/fuel match-status labels — same 3 keys every caller's UI catalog already carries. */
export interface StatusBadgeLabels {
  statusPending: string;
  statusConfirmed: string;
  statusMismatch: string;
}

/** CONFIRMED/MISMATCH/PENDING → {label, tone} — shared by every diesel/fuel screen (bulk stock, monitor, per-vehicle entry). */
export function materialTxnStatusBadge(status: MaterialTxnStatus, ui: StatusBadgeLabels): { label: string; tone: StatusTone } {
  if (status === 'CONFIRMED') return { label: `✓ ${ui.statusConfirmed}`, tone: 'success' };
  if (status === 'MISMATCH') return { label: `🚩 ${ui.statusMismatch}`, tone: 'error' };
  return { label: ui.statusPending, tone: 'warning' };
}

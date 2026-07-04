'use client';

/**
 * Audit chip (pilot-critical trust feature). FROZEN convention: a row whose
 * `version > 1` was edited/corrected after first save. On such rows we show
 * WHO corrected it (updatedBy → users list) and WHEN (updatedAt, Asia/Kolkata).
 * Renders nothing for never-corrected rows.
 */
import type { User } from '@techbuilder/contracts';
import { formatKolkataDateTime } from '@/lib/business-date';
import { useMessages } from '@/lib/i18n/locale-context';

export function AuditChip({
  row,
  users,
}: {
  row: { version: number; updatedBy: string; updatedAt: string };
  users: User[] | undefined;
}) {
  const m = useMessages();
  if (row.version <= 1) return null;
  const name = users?.find((u) => u.id === row.updatedBy)?.name ?? m.OWNER_UI.auditUnknownUser;
  return (
    <span
      data-testid="audit-chip"
      className="inline-block w-fit shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-800 dark:text-amber-400"
    >
      {m.OWNER_UI.auditCorrected} — {name} · {formatKolkataDateTime(row.updatedAt)}
    </span>
  );
}

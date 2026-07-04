'use client';

/**
 * Shared bits for the requests + approvals screens: the status badge and the
 * per-type payload summary. Payloads are `Record<string, unknown>` on the wire
 * (frozen SubmitRequestInput); this screen owns their shape, so it also stores
 * denormalized display labels (regNo / person name / type name) alongside the
 * canonical ids — approvers such as a Team Head cannot resolve a vehicleId
 * (they have no fleet scope), so the readable label must travel in the payload.
 */
import type { ApprovalStatus, ApprovalType, LeaveType, Uom } from '@techbuilder/contracts';
import { useMessages } from '@/lib/i18n/locale-context';
import type { Messages } from '@/lib/i18n/messages';
import { cn } from '@/lib/utils';

const STATUS_CLASS: Record<ApprovalStatus, string> = {
  PENDING: 'bg-amber-500/15 text-amber-800 dark:text-amber-400',
  APPROVED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  REJECTED: 'bg-destructive/10 text-destructive',
};

export function RequestStatusBadge({ status }: { status: ApprovalStatus }) {
  const m = useMessages();
  return (
    <span
      data-testid={`request-status-${status}`}
      className={cn('inline-block w-fit shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium', STATUS_CLASS[status])}
    >
      {m.APPROVAL_STATUS_LABELS[status]}
    </span>
  );
}

/** Best-effort readable string of a payload value. */
function str(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  return String(v);
}

interface Line {
  label: string;
  value: string;
}

/** Known fields per type, in a sensible order, resilient to missing keys. */
function linesFor(m: Messages, type: ApprovalType, p: Record<string, unknown>): Line[] {
  const f = m.REQUEST_FIELDS;
  const out: Line[] = [];
  const push = (label: string, value: string | undefined) => {
    if (value) out.push({ label, value });
  };

  if (type === 'VEHICLE_SWITCH') {
    push(f.vehicle, str(p.vehicleRegNo) ?? str(p.vehicleId));
    push(f.desiredType, str(p.desiredVehicleTypeName) ?? str(p.desiredVehicleTypeId));
    push(f.reason, str(p.reason));
  } else if (type === 'LEAVE') {
    push(f.person, p.self ? f.self : (str(p.personName) ?? str(p.personId)));
    push(f.fromDate, str(p.fromDate));
    push(f.toDate, str(p.toDate));
    const lt = str(p.type);
    push(f.leaveType, lt ? (m.LEAVE_TYPE_LABELS[lt as LeaveType] ?? lt) : undefined);
    push(f.reason, str(p.reason));
  } else if (type === 'MATERIAL') {
    push(f.material, str(p.material) ?? str(p.materialId));
    const qty = str(p.qty);
    const uom = str(p.uom);
    push(f.qty, qty ? `${qty}${uom ? ` ${m.UOM_LABELS[uom as Uom] ?? uom}` : ''}` : undefined);
    push(f.note, str(p.note));
  }

  // Fallback: if nothing known matched, show the raw entries so data is never hidden.
  if (out.length === 0) {
    for (const [k, v] of Object.entries(p)) push(k, str(v));
  }
  return out;
}

export function PayloadSummary({ type, payload }: { type: ApprovalType; payload: Record<string, unknown> }) {
  const m = useMessages();
  const lines = linesFor(m, type, payload);
  if (lines.length === 0) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm" data-testid="request-payload">
      {lines.map((l) => (
        <div key={l.label} className="col-span-2 grid grid-cols-subgrid">
          <dt className="text-muted-foreground">{l.label}</dt>
          <dd className="min-w-0 break-words">{l.value}</dd>
        </div>
      ))}
    </dl>
  );
}

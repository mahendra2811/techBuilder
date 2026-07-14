/**
 * Round 2 (frozen.8) — the TWO-TICK rule, shared by every money surface.
 *
 * Every money event (booked expense, decided request, cash transfer, vendor move) carries an
 * APPROVAL and a separate ACCOUNTANT-VERIFIED ✓. The verifier must be the site's ACCOUNTANT
 * (per-site desk, sites.accountant_id — user decision) or the OWNER (override). ok=false
 * red-flags the row (🚩 MONEY_FLAGGED → site SM + every Owner; the Owner resolves).
 * verified_at set → the row is PERMANENT: no edit, no void, no re-verify — for everyone.
 */
import { and, eq, isNull, inArray } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import * as schema from '@techbuilder/contracts/db/schema';
import type { VerifyInput } from '@techbuilder/contracts';
import { ApiException } from './api-exception';
import { forbidScope, type ScopeContext } from './scope.util';
import type { Tx } from '../db/db.service';

/** May this caller verify money on this site? ACCOUNTANT (own sites) or OWNER only — the SM may
 *  approve requests but never holds the verify tick (that's the whole point of the double-entry). */
export function assertCanVerify(ctx: ScopeContext, siteId: string | null): void {
  if (ctx.role === 'OWNER') return;
  if (ctx.role === 'ACCOUNTANT') {
    if (siteId && ctx.siteIds.includes(siteId)) return;
    forbidScope('This money event is outside your site scope');
  }
  forbidScope('Only the site accountant (or the Owner) can verify money events');
}

/** Common precondition: not deleted, not already verified (verified = permanent). */
export function assertNotVerified(row: { verifiedAt: Date | null; deletedAt: Date | null } | undefined, what: string): void {
  if (!row || row.deletedAt) throw new ApiException('NOT_FOUND', `${what} not found`);
  if (row.verifiedAt) throw new ApiException('CONFLICT', `${what} is already verified — verified entries are permanent`);
}

/** The column values a verification verdict writes (spread into the UPDATE set). */
export function verificationSet(ctx: ScopeContext, input: VerifyInput) {
  if (!input.ok && !input.flagNote?.trim()) {
    throw new ApiException('VALIDATION_FAILED', 'A note is required when flagging', { flagNote: 'required' });
  }
  return input.ok
    ? { verifiedBy: ctx.userId, verifiedAt: new Date(), flagged: false, flagNote: null, updatedBy: ctx.userId }
    : { flagged: true, flagNote: input.flagNote!.trim(), updatedBy: ctx.userId };
}

/** 🚩 MONEY_FLAGGED → the site's SM + every active Owner (the Owner decides the resolution). */
export async function notifyMoneyFlagged(
  tx: Tx,
  orgId: string,
  siteId: string | null,
  payload: Record<string, unknown>,
): Promise<void> {
  const targets = new Set<string>();
  if (siteId) {
    const [site] = await tx
      .select({ sm: schema.sites.siteManagerId })
      .from(schema.sites)
      .where(and(eq(schema.sites.id, siteId), isNull(schema.sites.deletedAt)));
    if (site?.sm) targets.add(site.sm);
  }
  const owners = await tx
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(isNull(schema.users.deletedAt), eq(schema.users.role, 'OWNER'), eq(schema.users.active, true)));
  owners.forEach((o) => targets.add(o.id));
  if (!targets.size) return;
  await tx.insert(schema.notifications).values(
    [...targets].map((userId) => ({
      id: uuidv7(),
      orgId,
      userId,
      type: 'MONEY_FLAGGED' as const,
      payload,
    })),
  );
}

/** The site's accountant (if assigned) — the routine decider/verifier for its money requests. */
export async function siteAccountantIds(tx: Tx, siteIds: string[]): Promise<string[]> {
  if (!siteIds.length) return [];
  const rows = await tx
    .select({ acc: schema.sites.accountantId })
    .from(schema.sites)
    .where(and(isNull(schema.sites.deletedAt), inArray(schema.sites.id, siteIds)));
  return [...new Set(rows.map((r) => r.acc).filter((x): x is string => !!x))];
}

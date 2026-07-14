/**
 * Pure ledger math + chain rules (WO-9 — money the Owner trusts or doesn't; unit-tested).
 *
 * Two pure concerns live here so the service is a thin DB shell around tested logic:
 *  1. `computeBalance` — a person's khata: balance = received − given − cash-spent.
 *  2. `chainAllows` / `ROLE_RANK` — who may hand cash to whom (GIVE down / RETURN up the chain).
 *
 * Integer paise everywhere. Negative balances ARE allowed (a person who spent/returned more
 * than he holds — a real "owes" state; the client decision is to surface it, never to block).
 */
import type { CashTransferKind, MyBalance, Role } from '@techbuilder/contracts';

/**
 * The authority chain: OWNER > ACCOUNTANT > SITE_MANAGER > SUPERVISOR > (DRIVER = WORKER at the bottom).
 * DRIVER and WORKER are deliberately EQUAL rank — neither is "above" the other, so neither
 * may hand cash to the other (a worker→worker / driver→worker GIVE is forbidden by rank alone).
 * ACCOUNTANT slots in between OWNER and SITE_MANAGER per the Round-2 design (CW-1 rename pass —
 * every pre-existing pair relation is preserved; ACCOUNTANT's own chain behavior is a later WO).
 */
export const ROLE_RANK: Record<Role, number> = {
  OWNER: 5,
  ACCOUNTANT: 4,
  SITE_MANAGER: 3,
  SUPERVISOR: 2,
  DRIVER: 1,
  WORKER: 1,
};

/**
 * Chain check (rank only — the site/crew SCOPE check is a separate DB concern in the service).
 *  - GIVE:   giver's role must be STRICTLY ABOVE the receiver's (money flows down).
 *  - RETURN: receiver's role must be STRICTLY ABOVE the giver's (balance handed back up, e.g. on leave).
 * `from` is always the caller; `to` is always the recipient — `kind` only sets the direction of authority.
 */
export function chainAllows(kind: CashTransferKind, fromRole: Role, toRole: Role): boolean {
  const from = ROLE_RANK[fromRole];
  const to = ROLE_RANK[toRole];
  return kind === 'GIVE' ? from > to : to > from;
}

export interface BalanceInput {
  /** Σ amountPaise of transfers TO this person (both GIVE and RETURN). */
  received: number;
  /** Σ amountPaise of transfers FROM this person (both GIVE and RETURN). */
  given: number;
  /** Σ approved CASH expenses entered by this person (paidVia=CASH, not void, not deleted). */
  cashSpent: number;
}

/** A person's khata. balance = received − given − cash-spent (may be negative). */
export function computeBalance({ received, given, cashSpent }: BalanceInput): MyBalance {
  return {
    receivedPaise: received,
    givenPaise: given,
    spentPaise: cashSpent,
    balancePaise: received - given - cashSpent,
  };
}

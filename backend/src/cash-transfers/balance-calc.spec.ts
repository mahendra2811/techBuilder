import { describe, expect, it } from 'vitest';
import { chainAllows, computeBalance, ROLE_RANK } from './balance-calc';

/**
 * WO-9 — HAND-COMPUTED fixtures for the khata number the Owner trusts or doesn't.
 * Rule: balance = received − given − cashSpent. All amounts are integer paise (₹1 = 100 paise).
 */
describe('computeBalance — hand-computed fixtures', () => {
  it('Fixture A (received cash, spent some): ₹1,000 received − ₹0 given − ₹300 spent = ₹700', () => {
    // 100000 received − 0 given − 30000 spent = 70000
    const b = computeBalance({ received: 100_000, given: 0, cashSpent: 30_000 });
    expect(b).toEqual({ receivedPaise: 100_000, givenPaise: 0, spentPaise: 30_000, balancePaise: 70_000 });
  });

  it('Fixture B (returned the remainder up the chain → balance zero): received ₹500, given(return) ₹200, spent ₹300', () => {
    // 50000 received − 20000 given − 30000 spent = 0  (worker got ₹500, spent ₹300, returned ₹200)
    const b = computeBalance({ received: 50_000, given: 20_000, cashSpent: 30_000 });
    expect(b.balancePaise).toBe(0);
    expect(b.givenPaise).toBe(20_000);
    expect(b.spentPaise).toBe(30_000);
  });

  it('Fixture C (NEGATIVE balance is allowed — spent more than held): received ₹100, spent ₹450 → −₹350', () => {
    // 10000 received − 0 given − 45000 spent = −35000 (person owes; must NOT be clamped to 0)
    const b = computeBalance({ received: 10_000, given: 0, cashSpent: 45_000 });
    expect(b.balancePaise).toBe(-35_000);
  });

  it('Fixture D (a giver/supervisor net-negative from handing cash down): received 0, given ₹2,00,000, spent 0 → −₹2,00,000', () => {
    // an SM who was never funded here but has handed ₹2L down shows −20000000 in THIS ledger view
    const b = computeBalance({ received: 0, given: 20_000_000, cashSpent: 0 });
    expect(b.balancePaise).toBe(-20_000_000);
    expect(b.receivedPaise).toBe(0);
  });

  it('every output is an INTEGER (paise never float)', () => {
    const b = computeBalance({ received: 123_457, given: 11, cashSpent: 999 });
    for (const v of [b.receivedPaise, b.givenPaise, b.spentPaise, b.balancePaise]) {
      expect(Number.isInteger(v)).toBe(true);
    }
    expect(b.balancePaise).toBe(122_447); // 123457 − 11 − 999
  });
});

describe('chainAllows — GIVE flows down, RETURN flows up', () => {
  it('GIVE is allowed only when the giver outranks the receiver', () => {
    expect(chainAllows('GIVE', 'OWNER', 'SITE_MANAGER')).toBe(true);
    expect(chainAllows('GIVE', 'SITE_MANAGER', 'TEAM_HEAD')).toBe(true);
    expect(chainAllows('GIVE', 'SITE_MANAGER', 'WORKER')).toBe(true);
    expect(chainAllows('GIVE', 'TEAM_HEAD', 'WORKER')).toBe(true);
    // same-rank or upward GIVE is forbidden
    expect(chainAllows('GIVE', 'WORKER', 'WORKER')).toBe(false);
    expect(chainAllows('GIVE', 'DRIVER', 'WORKER')).toBe(false); // equal rank
    expect(chainAllows('GIVE', 'WORKER', 'DRIVER')).toBe(false); // equal rank
    expect(chainAllows('GIVE', 'TEAM_HEAD', 'SITE_MANAGER')).toBe(false); // upward
    expect(chainAllows('GIVE', 'WORKER', 'OWNER')).toBe(false);
  });

  it('RETURN is allowed only when the receiver outranks the giver (balance handed up)', () => {
    expect(chainAllows('RETURN', 'WORKER', 'TEAM_HEAD')).toBe(true);
    expect(chainAllows('RETURN', 'WORKER', 'SITE_MANAGER')).toBe(true);
    expect(chainAllows('RETURN', 'TEAM_HEAD', 'SITE_MANAGER')).toBe(true);
    expect(chainAllows('RETURN', 'SITE_MANAGER', 'OWNER')).toBe(true);
    // downward or same-rank RETURN is forbidden
    expect(chainAllows('RETURN', 'SITE_MANAGER', 'WORKER')).toBe(false); // downward
    expect(chainAllows('RETURN', 'OWNER', 'SITE_MANAGER')).toBe(false); // downward
    expect(chainAllows('RETURN', 'DRIVER', 'WORKER')).toBe(false); // equal rank
  });

  it('rank ladder: OWNER > SITE_MANAGER > TEAM_HEAD > DRIVER = WORKER', () => {
    expect(ROLE_RANK.OWNER).toBeGreaterThan(ROLE_RANK.SITE_MANAGER);
    expect(ROLE_RANK.SITE_MANAGER).toBeGreaterThan(ROLE_RANK.TEAM_HEAD);
    expect(ROLE_RANK.TEAM_HEAD).toBeGreaterThan(ROLE_RANK.DRIVER);
    expect(ROLE_RANK.DRIVER).toBe(ROLE_RANK.WORKER);
  });
});

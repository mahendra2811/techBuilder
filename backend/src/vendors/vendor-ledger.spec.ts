import { describe, expect, it } from 'vitest';
import { computeVendorLedger } from './vendor-ledger';

/**
 * CW-6 — HAND-COMPUTED fixtures for the vendor khata (shop udhaar) balance.
 * Rule: balance = purchased + received − paid (what the site owes the vendor).
 * All amounts are integer paise (₹1 = 100 paise).
 */
describe('computeVendorLedger — hand-computed fixtures', () => {
  it('Fixture A (credit-only, no money-IN): ₹10,000 purchased − ₹4,000 paid → owes ₹6,000', () => {
    // 1,000,000 purchased + 0 received − 400,000 paid = 600,000
    const t = computeVendorLedger(
      [{ amountPaise: 1_000_000, businessDate: '2026-06-05' }],
      [{ amountPaise: 400_000, businessDate: '2026-06-10' }],
      [],
    );
    expect(t.purchasedPaise).toBe(1_000_000);
    expect(t.paidPaise).toBe(400_000);
    expect(t.receivedPaise).toBe(0);
    expect(t.balancePaise).toBe(600_000);
  });

  it('Fixture B (vendor money-IN increases what we owe): ₹5,000 purchased + ₹2,000 received − ₹1,000 paid → owes ₹6,000', () => {
    // 500,000 purchased + 200,000 received − 100,000 paid = 600,000
    const t = computeVendorLedger(
      [{ amountPaise: 500_000, businessDate: '2026-06-01' }],
      [{ amountPaise: 100_000, businessDate: '2026-06-02' }],
      [{ amountPaise: 200_000, businessDate: '2026-06-03' }],
    );
    expect(t.receivedPaise).toBe(200_000);
    expect(t.balancePaise).toBe(600_000);
  });

  it('Fixture C (fully settled + a receipt tips the balance back into owing): ₹10,000 purchased, ₹10,000 paid, ₹3,000 received → owes ₹3,000', () => {
    const t = computeVendorLedger(
      [{ amountPaise: 1_000_000, businessDate: '2026-06-01' }],
      [{ amountPaise: 1_000_000, businessDate: '2026-06-02' }],
      [{ amountPaise: 300_000, businessDate: '2026-06-04' }],
    );
    expect(t.balancePaise).toBe(300_000);
  });

  it('Fixture D (NEGATIVE balance is allowed — overpaid the vendor): ₹5,000 purchased − ₹8,000 paid → −₹3,000', () => {
    const t = computeVendorLedger(
      [{ amountPaise: 500_000, businessDate: '2026-06-01' }],
      [{ amountPaise: 800_000, businessDate: '2026-06-02' }],
      [],
    );
    expect(t.balancePaise).toBe(-300_000); // must NOT be clamped to 0
  });

  it('Fixture E (no activity at all): everything is zero', () => {
    const t = computeVendorLedger([], [], []);
    expect(t).toMatchObject({ purchasedPaise: 0, paidPaise: 0, receivedPaise: 0, balancePaise: 0, months: [] });
  });

  it('month buckets: rows split across two months are grouped + sorted chronologically', () => {
    const t = computeVendorLedger(
      [
        { amountPaise: 100_000, businessDate: '2026-05-20' },
        { amountPaise: 200_000, businessDate: '2026-06-03' },
      ],
      [{ amountPaise: 50_000, businessDate: '2026-06-15' }],
      [{ amountPaise: 30_000, businessDate: '2026-05-25' }],
    );
    expect(t.months).toEqual([
      { month: '2026-05', purchasedPaise: 100_000, paidPaise: 0, receivedPaise: 30_000 },
      { month: '2026-06', purchasedPaise: 200_000, paidPaise: 50_000, receivedPaise: 0 },
    ]);
    // Totals still sum across both months.
    expect(t.purchasedPaise).toBe(300_000);
    expect(t.paidPaise).toBe(50_000);
    expect(t.receivedPaise).toBe(30_000);
    expect(t.balancePaise).toBe(280_000); // 300,000 + 30,000 − 50,000
  });

  it('every output is an INTEGER (paise never float)', () => {
    const t = computeVendorLedger(
      [{ amountPaise: 123_457, businessDate: '2026-06-01' }],
      [{ amountPaise: 999, businessDate: '2026-06-02' }],
      [{ amountPaise: 11, businessDate: '2026-06-03' }],
    );
    for (const v of [t.purchasedPaise, t.paidPaise, t.receivedPaise, t.balancePaise]) {
      expect(Number.isInteger(v)).toBe(true);
    }
    expect(t.balancePaise).toBe(122_469); // 123,457 + 11 − 999
  });
});

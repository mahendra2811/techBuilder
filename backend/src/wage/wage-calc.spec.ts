import { describe, expect, it } from 'vitest';
import { computeWageRows } from './wage-calc';

/**
 * WP-5 — three HAND-COMPUTED fixtures for the number the Owner trusts or doesn't.
 * Rule: net = round(rate × (present + 0.5·half)) + round(ot × (rate/8) × otMult) − advances.
 */

const person = (id: string, name: string, defaultWagePaise: number | null = null) => ({ id, name, defaultWagePaise });
const att = (personId: string, status: string, otHours = 0) => ({
  personId,
  siteId: 'site-1',
  crewId: 'crew-1',
  status,
  otHours,
});

describe('computeWageRows — hand-computed fixtures', () => {
  it('Fixture A (plain days): ₹500/day × (5 present + 1 half) = ₹2,750, no OT, no advance', () => {
    const rows = [
      ...Array.from({ length: 5 }, () => att('p1', 'PRESENT')),
      att('p1', 'HALF_DAY'),
      att('p1', 'ABSENT'), // contributes nothing
    ];
    const { rows: out, totals } = computeWageRows(
      rows,
      [person('p1', 'Ramu')],
      [{ personId: 'p1', dailyPaise: 50_000, effectiveFrom: '2026-06-01' }],
      [],
      1.5,
    );
    expect(out).toHaveLength(1);
    const r = out[0]!;
    expect(r.presentDays).toBe(5);
    expect(r.halfDays).toBe(1);
    // 50000 × 5.5 = 275000 exactly
    expect(r.grossPayablePaise).toBe(275_000);
    expect(r.netPayablePaise).toBe(275_000);
    expect(totals).toEqual({ grossPaise: 275_000, advancePaise: 0, netPaise: 275_000 });
  });

  it('Fixture B (OT + advance): ₹600/day × 6 + 4h OT @1.5 = ₹4,050 gross − ₹300 advance = ₹3,750', () => {
    const sixDays = [
      ...Array.from({ length: 5 }, () => att('p2', 'PRESENT')),
      att('p2', 'PRESENT', 4), // 6th day carries the 4h OT
    ];
    const { rows: out } = computeWageRows(
      sixDays,
      [person('p2', 'Shyam')],
      [{ personId: 'p2', dailyPaise: 60_000, effectiveFrom: '2026-06-01' }],
      [{ personId: 'p2', amountPaise: 30_000 }],
      1.5,
    );
    const r = out[0]!;
    // base = 60000 × 6 = 360000 ; OT = 4 × (60000/8) × 1.5 = 4 × 7500 × 1.5 = 45000
    expect(r.grossPayablePaise).toBe(405_000);
    expect(r.advancePaise).toBe(30_000);
    expect(r.netPayablePaise).toBe(375_000);
  });

  it('Fixture C (default-rate fallback + fractional OT rounding + advance > gross → negative net)', () => {
    // No wage_rate row → falls back to defaultWagePaise 41700.
    // base = 41700 × (3 + 0.5) = 145950 (exact)
    // OT   = 3 × (41700/8 = 5212.5) × 1.25 = 19546.875 → rounds to 19547
    // gross = 165497 ; advance 200000 → net = −34503 (due from worker)
    const rows = [att('p3', 'PRESENT'), att('p3', 'PRESENT'), att('p3', 'PRESENT', 3), att('p3', 'HALF_DAY'), att('p3', 'LEAVE')];
    const { rows: out } = computeWageRows(rows, [person('p3', 'Mangal', 41_700)], [], [{ personId: 'p3', amountPaise: 200_000 }], 1.25);
    const r = out[0]!;
    expect(r.ratePaise).toBe(41_700);
    expect(r.grossPayablePaise).toBe(165_497);
    expect(r.netPayablePaise).toBe(-34_503);
  });
});

describe('computeWageRows — rules', () => {
  it('picks the LATEST effective rate on/before the window end', () => {
    const { rows: out } = computeWageRows(
      [att('p1', 'PRESENT')],
      [person('p1', 'Ramu')],
      [
        { personId: 'p1', dailyPaise: 55_000, effectiveFrom: '2026-06-01' },
        { personId: 'p1', dailyPaise: 58_000, effectiveFrom: '2026-06-20' },
      ],
      [],
      1.5,
    );
    expect(out[0]!.ratePaise).toBe(58_000);
    expect(out[0]!.grossPayablePaise).toBe(58_000);
  });

  it('ignores crew-level advances (personId null) in the per-person summary', () => {
    const { rows: out } = computeWageRows(
      [att('p1', 'PRESENT')],
      [person('p1', 'Ramu', 50_000)],
      [],
      [{ personId: null, amountPaise: 99_000 }],
      1.5,
    );
    expect(out[0]!.advancePaise).toBe(0);
  });

  it('every money output is INTEGER paise (never float)', () => {
    const { rows: out, totals } = computeWageRows(
      [att('p1', 'PRESENT', 1), att('p1', 'HALF_DAY', 2.5)],
      [person('p1', 'Ramu', 33_333)],
      [],
      [{ personId: 'p1', amountPaise: 111 }],
      1.5,
    );
    const r = out[0]!;
    for (const v of [r.ratePaise, r.grossPayablePaise, r.advancePaise, r.netPayablePaise, totals.grossPaise, totals.advancePaise, totals.netPaise]) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('person with no rate anywhere → 0 payable (not NaN)', () => {
    const { rows: out } = computeWageRows([att('p9', 'PRESENT')], [person('p9', 'NoRate')], [], [], 1.5);
    expect(out[0]!.grossPayablePaise).toBe(0);
    expect(out[0]!.netPayablePaise).toBe(0);
  });
});

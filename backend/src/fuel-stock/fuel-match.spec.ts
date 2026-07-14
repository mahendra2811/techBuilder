import { describe, expect, it } from 'vitest';
import { deriveDayFlags, matchVerdict, type DaySide } from './fuel-match';

const side = (over: Partial<DaySide> = {}): DaySide => ({
  id: 'x',
  litres: 40,
  status: 'PENDING',
  matchedId: null,
  ...over,
});

describe('matchVerdict (exact litres — client default)', () => {
  it('equal litres → CONFIRMED', () => {
    expect(matchVerdict(40, 40)).toBe('CONFIRMED');
  });
  it('float noise within 0.005 L still CONFIRMED', () => {
    expect(matchVerdict(40.001, 40.0)).toBe('CONFIRMED');
  });
  it('40 issued vs 30 received → MISMATCH', () => {
    expect(matchVerdict(40, 30)).toBe('MISMATCH');
  });
  it('even 1 litre off → MISMATCH (exact, no tolerance)', () => {
    expect(matchVerdict(40, 39)).toBe('MISMATCH');
  });
});

describe('deriveDayFlags', () => {
  const V = 'veh-1';
  const S = 'site-1';
  const D = '2026-07-12';

  it('a CONFIRMED pair produces no flag', () => {
    const iss = side({ id: 'i1', status: 'CONFIRMED', matchedId: 'r1' });
    const rec = side({ id: 'r1', status: 'CONFIRMED', matchedId: 'i1' });
    expect(deriveDayFlags(V, S, D, [iss], [rec], true)).toEqual([]);
  });

  it('a MISMATCH pair flags with both litre readings', () => {
    const iss = side({ id: 'i1', litres: 40, status: 'MISMATCH', matchedId: 'r1' });
    const rec = side({ id: 'r1', litres: 30, status: 'MISMATCH', matchedId: 'i1' });
    const flags = deriveDayFlags(V, S, D, [iss], [rec], false);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ issuedLitres: 40, receivedLitres: 30, status: 'MISMATCH', issuanceId: 'i1', fuelLogId: 'r1' });
  });

  it('a lone issuance stays quiet while the day is open, flags once it closes', () => {
    const iss = side({ id: 'i1' });
    expect(deriveDayFlags(V, S, D, [iss], [], false)).toEqual([]);
    const flags = deriveDayFlags(V, S, D, [iss], [], true);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ issuedLitres: 40, receivedLitres: null, fuelLogId: null });
  });

  it('a lone receipt (driver logged, supervisor never issued) flags after close', () => {
    const rec = side({ id: 'r1', litres: 25 });
    const flags = deriveDayFlags(V, S, D, [], [rec], true);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ issuedLitres: null, receivedLitres: 25, issuanceId: null, fuelLogId: 'r1' });
  });

  it('mixed day: one confirmed pair + one lone side → exactly the lone side flags', () => {
    const issA = side({ id: 'iA', status: 'CONFIRMED', matchedId: 'rA' });
    const recA = side({ id: 'rA', status: 'CONFIRMED', matchedId: 'iA' });
    const issB = side({ id: 'iB', litres: 15 });
    const flags = deriveDayFlags(V, S, D, [issA, issB], [recA], true);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.issuanceId).toBe('iB');
  });
});

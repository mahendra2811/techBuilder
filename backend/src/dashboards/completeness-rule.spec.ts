import { describe, expect, it } from 'vitest';
import { dayKey, deriveCompleteness } from './completeness-rule';

// 2026-07-02 is a Thursday → 2026-07-05 is a SUNDAY.
const WINDOW = { from: '2026-07-03', to: '2026-07-06' }; // Fri, Sat, Sun(off), Mon
const SITE = { id: 'site-1', status: 'ACTIVE', weeklyOff: [0] }; // Sunday off

const stateOf = (out: ReturnType<typeof deriveCompleteness>, date: string) =>
  out.find((c) => c.scopeId === 'site-1' && c.businessDate === date)?.state;

describe('deriveCompleteness (WP-5)', () => {
  it('COMPLETE = attendance AND progress; PARTIAL = one; MISSING = none', () => {
    const out = deriveCompleteness(
      'org-1',
      [SITE],
      new Set(),
      new Set([dayKey('site-1', '2026-07-03'), dayKey('site-1', '2026-07-04')]), // attendance Fri+Sat
      new Set([dayKey('site-1', '2026-07-03')]), // progress Fri only
      WINDOW,
    );
    expect(stateOf(out, '2026-07-03')).toBe('COMPLETE');
    expect(stateOf(out, '2026-07-04')).toBe('PARTIAL');
    expect(stateOf(out, '2026-07-06')).toBe('MISSING');
  });

  it('weekly-off days are skipped (no false MISSING on Sundays)', () => {
    const out = deriveCompleteness('org-1', [SITE], new Set(), new Set(), new Set(), WINDOW);
    expect(stateOf(out, '2026-07-05')).toBeUndefined(); // Sunday not evaluated
    expect(out.filter((c) => c.scopeId === 'site-1')).toHaveLength(3); // Fri, Sat, Mon
  });

  it('site holidays are skipped', () => {
    const out = deriveCompleteness(
      'org-1',
      [SITE],
      new Set([dayKey('site-1', '2026-07-06')]), // Monday is a holiday
      new Set(),
      new Set(),
      WINDOW,
    );
    expect(stateOf(out, '2026-07-06')).toBeUndefined();
  });

  it('inactive/paused sites are not evaluated at all', () => {
    const out = deriveCompleteness('org-1', [{ ...SITE, status: 'PAUSED' }], new Set(), new Set(), new Set(), WINDOW);
    expect(out).toHaveLength(0);
  });

  it('a backdated correction (attendance appearing later) flips the recomputed state', () => {
    // Same window recomputed after a backdated Fri attendance arrives — the rule is pure,
    // so recomputation IS the policy (WP-5 decision: completeness recomputes).
    const before = deriveCompleteness('org-1', [SITE], new Set(), new Set(), new Set([dayKey('site-1', '2026-07-03')]), WINDOW);
    const after = deriveCompleteness(
      'org-1',
      [SITE],
      new Set(),
      new Set([dayKey('site-1', '2026-07-03')]),
      new Set([dayKey('site-1', '2026-07-03')]),
      WINDOW,
    );
    expect(stateOf(before, '2026-07-03')).toBe('PARTIAL');
    expect(stateOf(after, '2026-07-03')).toBe('COMPLETE');
  });
});

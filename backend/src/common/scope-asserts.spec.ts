import { describe, expect, it } from 'vitest';
import { assertPersonInScope, assertSiteInScope, type ScopeContext } from './scope.util';
import { ApiException } from './api-exception';

/** WP-1/WP-5 — pure scope asserts against fabricated contexts (DB-free). */

const ctx = (over: Partial<ScopeContext>): ScopeContext => ({
  userId: 'u1',
  role: 'SUPERVISOR',
  personId: null,
  siteIds: [],
  crewIds: [],
  crewPersonIds: [],
  vehicleIds: [],
  ...over,
});

const forbidden = (fn: () => void) => {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof ApiException && e.code === 'FORBIDDEN';
  }
};

describe('assertSiteInScope', () => {
  it('OWNER acts on any site (ORG scope)', () => {
    expect(forbidden(() => assertSiteInScope(ctx({ role: 'OWNER' }), 'attendance.mark', 'site-X'))).toBe(false);
  });

  it('SITE_MANAGER passes on own site, FORBIDDEN on the other site', () => {
    const sm = ctx({ role: 'SITE_MANAGER', siteIds: ['site-A'] });
    expect(forbidden(() => assertSiteInScope(sm, 'attendance.mark', 'site-A'))).toBe(false);
    expect(forbidden(() => assertSiteInScope(sm, 'attendance.mark', 'site-B'))).toBe(true);
  });

  it('SUPERVISOR is bound to crew sites', () => {
    const th = ctx({ role: 'SUPERVISOR', siteIds: ['site-A'] });
    expect(forbidden(() => assertSiteInScope(th, 'record.enter', 'site-A'))).toBe(false);
    expect(forbidden(() => assertSiteInScope(th, 'record.enter', 'site-B'))).toBe(true);
  });

  it('role without the action at all is FORBIDDEN regardless of ids (WORKER marking attendance)', () => {
    const w = ctx({ role: 'WORKER', siteIds: ['site-A'] });
    expect(forbidden(() => assertSiteInScope(w, 'attendance.mark', 'site-A'))).toBe(true);
  });
});

describe('assertPersonInScope', () => {
  // NOTE (CW-1 rename): Round-2 removed attendance.mark from SUPERVISOR entirely (scope NONE),
  // so these crew-scope assertions now exercise 'record.enter' (still OWN_CREW for SUPERVISOR)
  // to keep testing the SAME crew-membership scope logic. Judgment call — see CW-1 report.
  it('SUPERVISOR passes for own-crew person, FORBIDDEN for outsiders', () => {
    const th = ctx({ role: 'SUPERVISOR', crewPersonIds: ['per-1', 'per-2'] });
    expect(forbidden(() => assertPersonInScope(th, 'record.enter', 'per-1'))).toBe(false);
    expect(forbidden(() => assertPersonInScope(th, 'record.enter', 'per-9'))).toBe(true);
  });

  it('OWNER passes for anyone', () => {
    expect(forbidden(() => assertPersonInScope(ctx({ role: 'OWNER' }), 'attendance.mark', 'per-9'))).toBe(false);
  });

  it('empty crew (misconfigured SUPERVISOR) denies everyone — fail closed', () => {
    const th = ctx({ role: 'SUPERVISOR', crewPersonIds: [] });
    expect(forbidden(() => assertPersonInScope(th, 'record.enter', 'per-1'))).toBe(true);
  });
});

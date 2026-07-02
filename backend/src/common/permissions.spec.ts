import { describe, expect, it } from 'vitest';
import { PERMISSIONS, can, scopeFor } from '@techbuilder/contracts';

/**
 * WP-5 — snapshot of the frozen RBAC matrix. If this test fails, either the contracts
 * changed (requires a frozen-version bump + this snapshot updated deliberately) or
 * something redefined permissions — both must be conscious decisions, never drift.
 */
describe('RBAC matrix snapshot (frozen contracts)', () => {
  it('matches the Build-Readiness Spec §4 matrix exactly', () => {
    expect(PERMISSIONS).toEqual({
      OWNER: {
        'user.create': 'ORG',
        'site.manage': 'ORG',
        'vehicle.manage': 'ORG',
        'attendance.mark': 'ORG',
        'request.decide': 'ORG',
        'wage.view': 'ORG',
        'report.export': 'ORG',
        'config.manage': 'ORG',
        'view.all': 'ORG',
      },
      SITE_MANAGER: {
        'user.create': 'OWN_SITE',
        'vehicle.manage': 'OWN_SITE',
        'attendance.mark': 'OWN_SITE',
        'record.enter': 'OWN_SITE',
        'vehicleLog.enter': 'OWN_SITE',
        'request.submit': 'OWN_SITE',
        'request.decide': 'OWN_SITE',
        'wage.view': 'OWN_SITE',
        'report.export': 'OWN_SITE',
        'view.all': 'OWN_SITE',
      },
      TEAM_HEAD: {
        'user.create': 'OWN_CREW',
        'attendance.mark': 'OWN_CREW',
        'record.enter': 'OWN_CREW',
        'request.submit': 'OWN_CREW',
        'request.decide': 'OWN_CREW',
        'view.all': 'OWN_CREW',
      },
      DRIVER: {
        'vehicleLog.enter': 'OWN_VEHICLE',
        'request.submit': 'OWN_VEHICLE',
        'view.all': 'OWN_VEHICLE',
      },
      WORKER: {
        'view.all': 'SELF',
      },
    });
  });

  it('load-bearing denials hold (Spec §4: Owner does NOT enter records; Worker is view-only)', () => {
    expect(can('OWNER', 'record.enter')).toBe(false);
    expect(can('OWNER', 'vehicleLog.enter')).toBe(false);
    expect(can('WORKER', 'record.enter')).toBe(false);
    expect(can('WORKER', 'attendance.mark')).toBe(false);
    expect(can('DRIVER', 'record.enter')).toBe(false);
    expect(can('DRIVER', 'wage.view')).toBe(false);
    expect(can('TEAM_HEAD', 'wage.view')).toBe(false);
    expect(can('TEAM_HEAD', 'report.export')).toBe(false);
  });

  it('scopeFor returns NONE for undefined role/action pairs', () => {
    expect(scopeFor('WORKER', 'record.enter')).toBe('NONE');
    expect(scopeFor('DRIVER', 'attendance.mark')).toBe('NONE');
  });
});

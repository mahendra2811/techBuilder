/**
 * RBAC — FROZEN. Single source of truth for both the client `can()` (UI gating, ADVISORY)
 * and the server guard (AUTHORITATIVE; re-derives scope from the DB).
 */
import type { Role } from './enums';

export const ACTIONS = [
  'user.create',
  'site.manage',
  'vehicle.manage',
  'attendance.mark',
  'record.enter', // expense/material/progress/issue at site/crew scope
  'vehicleLog.enter', // driver vehicle/fuel/trip logs
  'request.submit',
  'request.decide',
  'wage.view',
  'report.export',
  'config.manage',
  'view.all', // org-wide read
] as const;
export type Action = (typeof ACTIONS)[number];

/** Scope at which a role may perform an action. */
export type Scope = 'ORG' | 'OWN_SITE' | 'OWN_CREW' | 'OWN_VEHICLE' | 'SELF' | 'NONE';

/** Matrix: for each role, the scope at which each action is permitted (NONE = denied). */
export const PERMISSIONS: Record<Role, Partial<Record<Action, Scope>>> = {
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
    'request.decide': 'OWN_CREW', // vehicle-switch within crew
    'view.all': 'OWN_CREW',
  },
  DRIVER: {
    'vehicleLog.enter': 'OWN_VEHICLE',
    'request.submit': 'OWN_VEHICLE',
    'view.all': 'OWN_VEHICLE',
  },
  WORKER: {
    'request.submit': 'SELF', // EXPENSE_ADD requests only — the type restriction is enforced in approvals.service
    'view.all': 'SELF',
  },
};

/** Advisory client check. Server re-derives scope from DB and is authoritative. */
export function can(role: Role, action: Action): boolean {
  const scope = PERMISSIONS[role]?.[action];
  return scope !== undefined && scope !== 'NONE';
}

export function scopeFor(role: Role, action: Action): Scope {
  return PERMISSIONS[role]?.[action] ?? 'NONE';
}

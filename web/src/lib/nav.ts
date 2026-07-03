/**
 * Action → nav-item mapping (Phase 2 — VISIBILITY gating only).
 *
 * The 12 RBAC actions are backend permission verbs, not screens. This config
 * maps each action to one nav entry; an item renders ONLY if `can(role, action)`
 * is true for the logged-in role. `can`/`Action` come from the frozen
 * `@techbuilder/contracts` — the matrix data is NEVER redefined here.
 *
 * Feature screens do not exist yet (Phase 3), so every href except Dashboard
 * points at a not-yet-built placeholder route inside the role's own area
 * (e.g. /site-manager/attendance). `view.all` maps to the role's home.
 */
import type { Action, Role } from '@techbuilder/contracts';
import { can } from '@techbuilder/contracts';
import type { LucideIcon } from 'lucide-react';
import {
  BadgeCheck,
  ClipboardCheck,
  FileSpreadsheet,
  Fuel,
  LayoutDashboard,
  MapPinned,
  NotebookPen,
  Send,
  Settings,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import { roleHome } from './roles';
import type { Messages } from '@/lib/i18n/messages';

export type NavLabelKey = keyof Messages['NAV_LABELS'];

interface NavDef {
  action: Action;
  labelKey: NavLabelKey;
  /** Sub-path inside the role area; '' = the role home itself. */
  path: string;
  icon: LucideIcon;
}

/** Declaration order = display order: home first, day-to-day, then admin. */
const NAV_DEFS: NavDef[] = [
  { action: 'view.all', labelKey: 'dashboard', path: '', icon: LayoutDashboard },
  { action: 'attendance.mark', labelKey: 'attendance', path: '/attendance', icon: ClipboardCheck },
  { action: 'record.enter', labelKey: 'records', path: '/records', icon: NotebookPen },
  { action: 'vehicleLog.enter', labelKey: 'vehicleFuel', path: '/vehicle', icon: Fuel },
  { action: 'request.submit', labelKey: 'requests', path: '/requests', icon: Send },
  { action: 'request.decide', labelKey: 'approvals', path: '/approvals', icon: BadgeCheck },
  { action: 'user.create', labelKey: 'people', path: '/people', icon: Users },
  { action: 'site.manage', labelKey: 'sites', path: '/sites', icon: MapPinned },
  { action: 'vehicle.manage', labelKey: 'fleet', path: '/fleet', icon: Truck },
  { action: 'wage.view', labelKey: 'wages', path: '/wages', icon: Wallet },
  { action: 'report.export', labelKey: 'reports', path: '/reports', icon: FileSpreadsheet },
  { action: 'config.manage', labelKey: 'settings', path: '/settings', icon: Settings },
];

export interface NavItem {
  action: Action;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Dashboard matches its href exactly; others also match sub-routes. */
  exact: boolean;
  /** Stable testid: `nav-` + action with '.' → '-' (e.g. nav-attendance-mark). */
  testId: string;
}

/** Testid slug for an action: dots become hyphens. */
export function navTestId(action: Action): string {
  return `nav-${action.replace('.', '-')}`;
}

/** The nav items the given role is permitted to see, in display order.
 * Labels come from the active locale's catalog (passed in by the caller). */
export function navItemsFor(role: Role, labels: Messages['NAV_LABELS']): NavItem[] {
  const home = roleHome(role);
  return NAV_DEFS.filter((def) => can(role, def.action)).map((def) => ({
    action: def.action,
    label: labels[def.labelKey],
    href: `${home}${def.path}`,
    icon: def.icon,
    exact: def.path === '',
    testId: navTestId(def.action),
  }));
}

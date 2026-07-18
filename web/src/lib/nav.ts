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
  Boxes,
  CircleUserRound,
  FileSpreadsheet,
  Fuel,
  Gauge,
  IndianRupee,
  LayoutDashboard,
  MapPinned,
  MessageSquareWarning,
  NotebookPen,
  Send,
  Settings,
  Store,
  Truck,
  Users,
  Wallet,
  Wrench,
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
  /** Extra role filter for entries whose RBAC action alone is too broad (e.g. SM settings). */
  roles?: Role[];
  /** Override when the action-derived testid would collide with another entry. */
  testId?: string;
}

/** Declaration order = display order: home first, day-to-day, then admin. */
const NAV_DEFS: NavDef[] = [
  { action: 'view.all', labelKey: 'dashboard', path: '', icon: LayoutDashboard },
  // DRV-1/DRV-5 (docs/role-page-map/driver/driver-role-updates.md, frozen.10):
  // Start-of-day/End-of-day forms' own page — the dashboard's day-log chips link here.
  { action: 'vehicleLog.enter', labelKey: 'meter', path: '/meter', icon: Gauge, roles: ['DRIVER'], testId: 'nav-meter' },
  // Phase-scoping 2026-07: attendance & wages are manual for now (see docs/techBuilder-Build-WorkOrders.md WO-1)
  // { action: 'attendance.mark', labelKey: 'attendance', path: '/attendance', icon: ClipboardCheck },
  // WO-6/WO-14: the Records split — Expense + Progress are separate sections now.
  { action: 'record.enter', labelKey: 'expense', path: '/expense', icon: IndianRupee, testId: 'nav-expense' },
  { action: 'record.enter', labelKey: 'progress', path: '/progress', icon: NotebookPen, testId: 'nav-progress' },
  // The old combined Records screen stays routable at /records but is out of the menu.
  // { action: 'record.enter', labelKey: 'records', path: '/records', icon: NotebookPen },
  // The SM's /site-manager/vehicle entry keeps its original label+testid untouched.
  { action: 'vehicleLog.enter', labelKey: 'vehicleFuel', path: '/vehicle', icon: Fuel, roles: ['SITE_MANAGER'], testId: 'nav-vehicleLog-enter' },
  // frozen.10 (DRV-2 nav restructure): DRIVER's own /driver/vehicle entry, relabeled
  // "Vehicle" (was shared "Vehicle/Fuel") now that the page also hosts the vehicle-change
  // request form + history (see driver/vehicle/page.tsx). Distinct testId since it shares
  // the `vehicleLog.enter` action with the SM entry above and the fuel/damage entries below.
  { action: 'vehicleLog.enter', labelKey: 'vehicle', path: '/vehicle', icon: Fuel, roles: ['DRIVER'], testId: 'nav-vehicle-driver' },
  // DRV-2 (docs/role-page-map/driver/driver-role-updates.md, frozen.10): fuel + damage
  // split off the combined /vehicle page into their own DRIVER-only pages. Explicit
  // testIds since all three entries here share the `vehicleLog.enter` action.
  { action: 'vehicleLog.enter', labelKey: 'fuelEntry', path: '/fuel', icon: Fuel, roles: ['DRIVER'], testId: 'nav-fuel-entry' },
  { action: 'vehicleLog.enter', labelKey: 'damage', path: '/damage', icon: Wrench, roles: ['DRIVER'], testId: 'nav-damage' },
  // frozen.10 (DRV-2 nav restructure): the generic "Requests" entry (vehicle-change +
  // expense-request forms combined) no longer applies to DRIVER — his expense-request
  // form moved to its own page (see driver/expense/page.tsx) and vehicle-change requests
  // moved onto /driver/vehicle. SM/SUPERVISOR keep this entry exactly as before.
  // WORKER restructure (below): his expense-request form moved to its own page too.
  { action: 'request.submit', labelKey: 'requests', path: '/requests', icon: Send, roles: ['SITE_MANAGER', 'SUPERVISOR'] },
  // DRIVER-only replacement: expense-request form + history at /driver/expense.
  { action: 'request.submit', labelKey: 'expense', path: '/expense', icon: IndianRupee, roles: ['DRIVER'], testId: 'nav-expense-driver' },
  // WORKER restructure: expense-request form + history at /worker/expense (was /worker/requests).
  { action: 'request.submit', labelKey: 'expense', path: '/expense', icon: IndianRupee, roles: ['WORKER'], testId: 'nav-expense-worker' },
  { action: 'request.decide', labelKey: 'approvals', path: '/approvals', icon: BadgeCheck },
  // Round 2: the SUPERVISOR lost request.decide but keeps READ-ONLY visibility of his own
  // crew's requests (client: worker/driver → their supervisor → SM + accountant).
  { action: 'view.all', labelKey: 'approvals', path: '/approvals', icon: BadgeCheck, roles: ['SUPERVISOR'], testId: 'nav-approvals-supervisor' },
  { action: 'user.create', labelKey: 'people', path: '/people', icon: Users },
  { action: 'site.manage', labelKey: 'sites', path: '/sites', icon: MapPinned },
  { action: 'vehicle.manage', labelKey: 'fleet', path: '/fleet', icon: Truck },
  // { action: 'wage.view', labelKey: 'wages', path: '/wages', icon: Wallet },
  // Round 2: the ACCOUNTANT holds report.export (financial sections) but has no reports screen
  // variant yet — role-filtered to keep his nav honest until that lands (known follow-up).
  { action: 'report.export', labelKey: 'reports', path: '/reports', icon: FileSpreadsheet, roles: ['OWNER', 'SITE_MANAGER'] },
  { action: 'config.manage', labelKey: 'settings', path: '/settings', icon: Settings },
  // WO-13: date-wise insights — "pick a day, see everything" (S-1/T-1/O-1). Service-gated scopes.
  { action: 'view.all', labelKey: 'insights', path: '/insights', icon: FileSpreadsheet, roles: ['OWNER', 'SITE_MANAGER'], testId: 'nav-insights' },
  // WO-9: money ledger (khata) — give/receive-back cash + rollup. Round 2: the ACCOUNTANT is the
  // cash desk — his ledger page mounts the same screen (rollup stays SM/Owner server-side).
  { action: 'view.all', labelKey: 'ledger', path: '/ledger', icon: Wallet, roles: ['OWNER', 'SITE_MANAGER', 'ACCOUNTANT'], testId: 'nav-ledger' },
  // WO-10: shops / udhaar khata. Round 2: the ACCOUNTANT records vendor payments + money-IN too.
  { action: 'view.all', labelKey: 'vendors', path: '/vendors', icon: Store, roles: ['SITE_MANAGER', 'ACCOUNTANT'], testId: 'nav-vendors' },
  // WO-8: SM site settings (limits · categories · form fields · emergency contacts). The SM holds
  // no config.manage — the PATCH is service-gated to his own site, so the nav entry is role-filtered.
  { action: 'view.all', labelKey: 'settings', path: '/settings', icon: Settings, roles: ['SITE_MANAGER'], testId: 'nav-settings-sm' },
  // ---- Round 2 (frozen.8) ----
  // C11 materials: SM/Owner manage the catalog; the SUPERVISOR files final IN/CONSUME entries.
  { action: 'view.all', labelKey: 'materials', path: '/materials', icon: Boxes, roles: ['OWNER', 'SITE_MANAGER'], testId: 'nav-materials' },
  { action: 'record.enter', labelKey: 'materials', path: '/materials', icon: Boxes, roles: ['SUPERVISOR'], testId: 'nav-materials-supervisor' },
  // C7 diesel: the supervisor's bulk-stock + per-vehicle issuance forms (his side of the match).
  { action: 'record.enter', labelKey: 'diesel', path: '/diesel', icon: Fuel, roles: ['SUPERVISOR'], testId: 'nav-diesel' },
  // Complaint box: four roles raise; SM/Owner read the inbox (OWNER-target rows never reach an SM).
  { action: 'view.all', labelKey: 'complaints', path: '/complaints', icon: MessageSquareWarning, roles: ['WORKER', 'DRIVER', 'SUPERVISOR', 'ACCOUNTANT'], testId: 'nav-complaints' },
  { action: 'view.all', labelKey: 'complaints', path: '/complaints', icon: MessageSquareWarning, roles: ['SITE_MANAGER', 'OWNER'], testId: 'nav-complaints-inbox' },
  // frozen.9: cross-role Profile page — every role holds view.all, so this reaches all 6;
  // the explicit testId avoids colliding with the Dashboard entry's derived nav-view-all.
  { action: 'view.all', labelKey: 'profile', path: '/profile', icon: CircleUserRound, testId: 'nav-profile' },
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
  return NAV_DEFS.filter((def) => can(role, def.action) && (!def.roles || def.roles.includes(role))).map((def) => ({
    action: def.action,
    label: labels[def.labelKey],
    href: `${home}${def.path}`,
    icon: def.icon,
    exact: def.path === '',
    testId: def.testId ?? navTestId(def.action),
  }));
}
